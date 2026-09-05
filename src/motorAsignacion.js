// =========================================================
// MOTOR DE DISTRIBUCIÓN AUTOMÁTICA DE CASILLAS
//
// Archivo aislado a propósito: es lógica pura (sin React, sin
// localStorage, sin nada de la UI) para poder ajustarla sin tocar el
// resto de la app. Recibe una descripción de qué casillas abrir, con
// qué reglas, y devuelve una matriz de asignaciones.
//
// No es un solver óptimo — es un reparto voraz (greedy) hora por
// hora, con dos reglas duras (tope de permanencia, piso de descanso
// entre tandas) y una de equidad (siempre elige, entre los
// disponibles, al que menos horas acumuladas lleva). Como ya se
// charló: el resultado puede no ser parejo — un agente puede terminar
// con una tanda de 1 hora estando permitidas 2, o con un descanso de
// 3 horas estando pedido un mínimo de 1 — son topes/pisos, no valores
// fijos, así que eso es esperable y aceptable.
// =========================================================

/**
 * @param {Object} params
 * @param {string[]} params.agentesIds - IDs disponibles para repartir, en orden de prioridad de llegada
 *        (a igualdad de horas acumuladas, gana el que aparece primero en este array).
 * @param {Array<{filaIdx: number, horas: number[]}>} params.casillasAbiertas
 *        - por cada casilla (índice de fila dentro de la vista), qué horas (0-23) hay que cubrir.
 *          Solo se deben pasar horas REALMENTE libres (el llamador filtra lo ya ocupado).
 * @param {number[]} params.ordenHoras - las horas (0-23) en el orden cronológico del turno
 *        (ya resuelto por quien llama — típicamente horasTurno), para poder detectar continuidad
 *        y manejar el cruce de medianoche correctamente.
 * @param {number} params.permanenciaMaxima - horas máximas seguidas por tanda (tope, no fijo).
 * @param {number} params.intervaloMinimo - horas mínimas de descanso entre tandas del mismo agente (piso, no fijo).
 * @param {number} params.filas - cantidad de filas (casillas) de la vista, para dimensionar la matriz de salida.
 *
 * @returns {{
 *   matriz: (string|null)[][],           // 24 columnas por fila, mismo formato que el resto de la app
 *   resumen: {agenteId: string, horasAsignadas: number}[],
 *   horasSinCubrir: number                // franjas que quedaron sin nadie disponible (raro, pero puede pasar)
 * }}
 */
export function generarAsignacion({
  agentesIds,
  casillasAbiertas,
  ordenHoras,
  permanenciaMaxima,
  intervaloMinimo,
  filas,
}) {
  const matriz = Array(filas)
    .fill()
    .map(() => Array(24).fill(null));

  if (!agentesIds?.length || !casillasAbiertas?.length || !ordenHoras?.length) {
    return { matriz, resumen: [], horasSinCubrir: 0 };
  }

  const casillasComoSets = casillasAbiertas.map((c) => ({ filaIdx: c.filaIdx, horas: new Set(c.horas) }));

  const estado = new Map();
  agentesIds.forEach((id) => {
    estado.set(id, {
      horasAcumuladas: 0,
      tandaFila: null,
      tandaLargo: 0,
      ultimaTandaFinIdx: null, // índice dentro de ordenHoras, para medir el descanso
    });
  });

  let horasSinCubrir = 0;

  ordenHoras.forEach((hora, idx) => {
    const abiertasAhora = casillasComoSets.filter((c) => c.horas.has(hora));
    if (abiertasAhora.length === 0) return;

    const usadosEsteMomento = new Set();
    const casillasSinCubrirEstaHora = [];

    // 1) Continuidad: quien ya estaba en la casilla sigue, si no llegó
    // a su tope de permanencia.
    abiertasAhora.forEach((c) => {
      const horaAnterior = idx > 0 ? ordenHoras[idx - 1] : null;
      const ocupanteAnterior = horaAnterior !== null ? matriz[c.filaIdx][horaAnterior] : null;

      if (ocupanteAnterior) {
        const est = estado.get(ocupanteAnterior);
        if (est && est.tandaFila === c.filaIdx && est.tandaLargo < permanenciaMaxima) {
          matriz[c.filaIdx][hora] = ocupanteAnterior;
          est.horasAcumuladas += 1;
          est.tandaLargo += 1;
          usadosEsteMomento.add(ocupanteAnterior);
          return;
        }
        // La tanda se corta acá (tope alcanzado, o cambió de casilla).
        if (est) {
          est.ultimaTandaFinIdx = idx - 1;
          est.tandaFila = null;
          est.tandaLargo = 0;
        }
      }
      casillasSinCubrirEstaHora.push(c);
    });

    // 2) Lo que quedó sin continuidad se cubre con quien menos horas
    // acumuladas lleve, entre los que respetan el descanso mínimo y
    // no están ya ocupados en otra casilla esta misma hora.
    casillasSinCubrirEstaHora.forEach((c) => {
      const elegibles = agentesIds.filter((id) => {
        if (usadosEsteMomento.has(id)) return false;
        const est = estado.get(id);
        if (est.ultimaTandaFinIdx !== null && idx - est.ultimaTandaFinIdx < intervaloMinimo) return false;
        return true;
      });

      if (elegibles.length === 0) {
        horasSinCubrir += 1;
        return;
      }

      elegibles.sort((a, b) => {
        const diff = estado.get(a).horasAcumuladas - estado.get(b).horasAcumuladas;
        return diff !== 0 ? diff : agentesIds.indexOf(a) - agentesIds.indexOf(b);
      });

      const elegido = elegibles[0];
      const est = estado.get(elegido);
      matriz[c.filaIdx][hora] = elegido;
      est.horasAcumuladas += 1;
      est.tandaFila = c.filaIdx;
      est.tandaLargo = 1;
      usadosEsteMomento.add(elegido);
    });
  });

  const resumen = agentesIds.map((id) => ({
    agenteId: id,
    horasAsignadas: estado.get(id).horasAcumuladas,
  }));

  return { matriz, resumen, horasSinCubrir };
}
