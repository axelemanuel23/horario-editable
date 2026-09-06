// =========================================================
// MOTOR DE DISTRIBUCIÓN AUTOMÁTICA DE CASILLAS
//
// Archivo aislado a propósito: es lógica pura (sin React, sin
// localStorage, sin nada de la UI). Recibe el estado REAL de la
// matriz (con lo que ya esté asignado a mano) y una descripción de
// qué horas hay que cubrir en cada casilla, y devuelve una matriz
// nueva completando SOLO las celdas vacías.
//
// No reorganiza nada de lo existente: nunca toca una celda que ya
// tenga un agente (manual o de una corrida anterior del motor).
//
// No es un solver que fuerza cobertura total: tiene dos reglas duras
// (tope de horas seguidas, piso de descanso entre tandas) y ante
// cualquier celda donde ningún agente disponible pueda entrar sin
// romperlas, se deja como hueco a propósito — no se fuerza. El
// criterio de equidad para desempatar entre candidatos válidos es
// menor carga horaria acumulada (y a igualdad, el orden de llegada
// en agentesIds).
// =========================================================

const HORAS_DIA = 24;

function mod(n, m) {
  return ((n % m) + m) % m;
}

// Distancia circular entre dos horas del día (0-23), sabiendo que la
// grilla es de 24 columnas fijas — esto es válido sin importar qué
// ventana de turno se esté mirando, porque las horas son siempre
// absolutas de reloj.
function distanciaCircular(a, b) {
  const diff = Math.abs(a - b);
  return Math.min(diff, HORAS_DIA - diff);
}

function distanciaMinima(horasOcupadas, hora) {
  let min = Infinity;
  horasOcupadas.forEach((h) => {
    const d = distanciaCircular(h, hora);
    if (d < min) min = d;
  });
  return min;
}

// Si se agregara `hora` al set de horas ocupadas, ¿qué tan larga
// quedaría la racha consecutiva que la incluye?
function longitudRachaSiAgrega(horasOcupadas, hora) {
  let horas = 1;
  let i = mod(hora - 1, HORAS_DIA);
  let pasos = 0;
  while (pasos < HORAS_DIA - 1) {
    if (!horasOcupadas.has(i)) break;
    horas++;
    i = mod(i - 1, HORAS_DIA);
    pasos++;
  }
  i = mod(hora + 1, HORAS_DIA);
  pasos = 0;
  while (pasos < HORAS_DIA - 1) {
    if (!horasOcupadas.has(i)) break;
    horas++;
    i = mod(i + 1, HORAS_DIA);
    pasos++;
  }
  return horas;
}

// ¿Puede este agente tomar `hora` sin romper permanencia máxima ni
// intervalo mínimo, dado el set de horas donde ya está asignado
// (en esta vista, incluyendo lo manual y lo que el motor ya decidió
// en esta misma corrida)?
function esElegiblePorReglas(horasOcupadas, hora, permanenciaMaxima, intervaloMinimo) {
  const distancia = distanciaMinima(horasOcupadas, hora);

  if (distancia === Infinity) return true; // sin asignaciones previas, nada que romper

  if (distancia === 1) {
    // Extendería una racha ya existente: solo importa el largo final.
    return longitudRachaSiAgrega(horasOcupadas, hora) <= permanenciaMaxima;
  }

  // No es adyacente a nada: el hueco hasta la asignación más cercana
  // tiene que ser al menos el intervalo mínimo.
  return distancia - 1 >= intervaloMinimo;
}

/**
 * @param {Object} params
 * @param {string[]} params.agentesIds - IDs disponibles para repartir, en orden de prioridad de llegada.
 * @param {Array<{filaIdx: number, horas: number[]}>} params.casillasAbiertas
 *        - por cada casilla, qué horas hay que intentar cubrir (se re-chequea igual contra la matriz real).
 * @param {number[]} params.ordenHoras - horas (0-23) en el orden cronológico del turno.
 * @param {number} params.permanenciaMaxima - horas máximas seguidas por tanda (tope, no fijo).
 * @param {number} params.intervaloMinimo - horas mínimas de descanso entre tandas (piso, no fijo).
 * @param {number} params.filas - cantidad de filas (casillas) de la vista.
 * @param {(string|null)[][]} [params.matrizActual] - matriz real de la vista, con lo ya asignado a
 *        mano (o de una corrida anterior). Si no se pasa, arranca en blanco (compatibilidad).
 *
 * @returns {{
 *   matriz: (string|null)[][],            // matriz completa: lo existente + lo nuevo agregado
 *   resumen: {agenteId: string, horasAsignadas: number}[],
 *   horasSinCubrir: number
 * }}
 */
export function generarAsignacion({
  agentesIds,
  casillasAbiertas,
  ordenHoras,
  permanenciaMaxima,
  intervaloMinimo,
  filas,
  matrizActual,
}) {
  const matriz = matrizActual
    ? matrizActual.map((fila) => [...fila])
    : Array(filas).fill().map(() => Array(HORAS_DIA).fill(null));
  // Por si la matriz guardada quedó corta respecto a la cantidad de casillas actual.
  while (matriz.length < filas) matriz.push(Array(HORAS_DIA).fill(null));

  if (!agentesIds?.length || !casillasAbiertas?.length || !ordenHoras?.length) {
    return { matriz, resumen: [], horasSinCubrir: 0 };
  }

  const casillasComoSets = casillasAbiertas.map((c) => ({ filaIdx: c.filaIdx, horas: new Set(c.horas) }));

  // Estado por agente: horas donde YA está en esta vista (leídas de la
  // matriz real) más las que el motor le vaya sumando en esta corrida.
  const estado = new Map();
  agentesIds.forEach((id) => {
    const horasOcupadas = new Set();
    matriz.forEach((fila) => {
      fila.forEach((celda, hora) => {
        if (celda === id) horasOcupadas.add(hora);
      });
    });
    estado.set(id, { horasOcupadas, carga: horasOcupadas.size });
  });

  let horasSinCubrir = 0;

  ordenHoras.forEach((hora) => {
    const abiertasAhora = casillasComoSets.filter(
      (c) => c.horas.has(hora) && matriz[c.filaIdx]?.[hora] == null
    );
    if (abiertasAhora.length === 0) return;

    const usadosEsteMomento = new Set();

    abiertasAhora.forEach((c) => {
      const candidatos = agentesIds.filter((id) => {
        if (usadosEsteMomento.has(id)) return false;
        const est = estado.get(id);
        if (est.horasOcupadas.has(hora)) return false; // ya ocupado a esta hora, en otra casilla
        return esElegiblePorReglas(est.horasOcupadas, hora, permanenciaMaxima, intervaloMinimo);
      });

      if (candidatos.length === 0) {
        horasSinCubrir += 1;
        return;
      }

      candidatos.sort((a, b) => {
        const diff = estado.get(a).carga - estado.get(b).carga;
        return diff !== 0 ? diff : agentesIds.indexOf(a) - agentesIds.indexOf(b);
      });

      const elegido = candidatos[0];
      const est = estado.get(elegido);
      matriz[c.filaIdx][hora] = elegido;
      est.horasOcupadas.add(hora);
      est.carga += 1;
      usadosEsteMomento.add(elegido);
    });
  });

  const resumen = agentesIds.map((id) => ({
    agenteId: id,
    horasAsignadas: estado.get(id).carga,
  }));

  return { matriz, resumen, horasSinCubrir };
}
