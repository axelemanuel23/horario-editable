// =========================================================
// MOTOR DE DISTRIBUCIÓN AUTOMÁTICA DE CASILLAS
//
// Pura (sin React/localStorage). Recibe el estado real de la matriz
// (lo ya asignado a mano) y cubre las horas libres respetando SIEMPRE:
//   - permanenciaMaxima: tope de horas seguidas por bloque/asignación
//     en la misma casilla.
//   - rachaMinima: piso de horas por bloque (si no se puede armar un
//     bloque de al menos este tamaño para un agente en una celda, ese
//     agente queda descartado para esa celda — no se lo fuerza).
//   - intervaloMinimo: piso de descanso entre bloques del mismo agente.
//   - horasMaximas: tope de horas totales del agente en el día,
//     contando TODAS las vistas del paso (lo pasa el llamador).
//   - ventanasPorAgente: ventana real de guardia de cada agente (según
//     su horario de entrada real, o su turno como proxy — lo arma el
//     llamador). Ninguna hora de ningún bloque puede caer fuera de
//     ella.
//
// No fuerza cobertura: ante cualquier hora sin candidato válido, queda
// como hueco para que el usuario lo resuelva a mano.
//
// MODELO: no hay bloques fijos ni trocheo previo. Cada hora-en-casilla
// es una celda atómica. El algoritmo procesa las celdas de a una
// (orden MRV — ver abajo) y, al asignar, hace CRECER la racha del
// agente elegido hacia ambos lados (bidireccional) mientras siga
// siendo válido, aprovechando el margen real que le queda en ese
// momento en vez de un tamaño de tanda precalculado.
//
// Orden de procesamiento (MRV — minimum remaining values, técnica
// estándar de resolución de restricciones): en cada paso se elige la
// celda libre con MENOS candidatos factibles en ese momento (empate:
// la más temprana). Procesar así evita que una celda con muchas
// alternativas "gaste" a un agente que en realidad era el único que
// podía cubrir otra celda más restringida.
//
// Desempate de candidatos para una misma celda: menor carga actual
// -> bloque factible más largo (Best-Fit: aprovecha mejor el margen
// disponible en vez de fragmentarlo) -> prioridad fija de categoría
// (Refuerzo Medio > Refuerzo Completo > Comisionado > Inspector) ->
// orden de agentesIds.
// =========================================================

const HORAS_DIA = 24;

const PRIORIDAD_CATEGORIA = ['refuerzo_medio', 'refuerzo_completo', 'comisionado', 'inspector'];

function prioridadCategoria(categoria) {
  const idx = PRIORIDAD_CATEGORIA.indexOf(categoria);
  return idx === -1 ? PRIORIDAD_CATEGORIA.length : idx; // categoría desconocida: al final, sin romper
}

function mod(n, m) {
  return ((n % m) + m) % m;
}

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

function longitudRachaHaciaAtras(horasOcupadas, desde) {
  let largo = 0;
  let i = desde;
  while (horasOcupadas.has(i) && largo < HORAS_DIA) {
    largo++;
    i = mod(i - 1, HORAS_DIA);
  }
  return largo;
}

function longitudRachaHaciaAdelante(horasOcupadas, desde) {
  let largo = 0;
  let i = desde;
  while (horasOcupadas.has(i) && largo < HORAS_DIA) {
    largo++;
    i = mod(i + 1, HORAS_DIA);
  }
  return largo;
}

// ¿`hora` cae dentro de la ventana [inicio, fin) circular (contempla
// ventanas que cruzan medianoche)? Duplicada a propósito (no se
// importa de utils/asignacionCasillas.js) para que este archivo siga
// siendo puro y autocontenido.
function dentroDeVentanaCircular(hora, inicio, fin) {
  if (inicio == null || fin == null) return true;
  if (inicio === fin) return true;
  if (inicio < fin) return hora >= inicio && hora < fin;
  return hora >= inicio || hora < fin;
}

// ¿Puede este agente tomar el bloque completo (rango contiguo de
// horas, ya elegido) sin romper permanencia máxima ni intervalo
// mínimo, dado su set de horas ya ocupadas (en todas las vistas)?
// Si el bloque queda pegado a una racha ya existente del mismo agente,
// se cuentan juntas a los fines de permanenciaMaxima (se están
// fusionando en una sola racha real).
function evaluarTanda(horasOcupadas, tandaHoras, permanenciaMaxima, intervaloMinimo) {
  const inicio = tandaHoras[0];
  const fin = tandaHoras[tandaHoras.length - 1];
  const antes = mod(inicio - 1, HORAS_DIA);
  const despues = mod(fin + 1, HORAS_DIA);

  let largoTotal = tandaHoras.length;

  if (horasOcupadas.has(antes)) {
    largoTotal += longitudRachaHaciaAtras(horasOcupadas, antes);
  } else {
    const distancia = distanciaMinima(horasOcupadas, inicio);
    if (distancia !== Infinity && distancia - 1 < intervaloMinimo) return false;
  }

  if (horasOcupadas.has(despues)) {
    largoTotal += longitudRachaHaciaAdelante(horasOcupadas, despues);
  } else {
    const distancia = distanciaMinima(horasOcupadas, fin);
    if (distancia !== Infinity && distancia - 1 < intervaloMinimo) return false;
  }

  return largoTotal <= permanenciaMaxima;
}

/**
 * @param {string[]} agentesIds - orden de prioridad para desempatar por igual carga y categoría.
 * @param {Array<{filaIdx:number, horas:number[]}>} casillasAbiertas - horas a intentar cubrir por casilla
 *        (ya filtradas por el llamador a las que estaban libres al momento de abrir el modal).
 * @param {number[]} ordenHoras - horas de la franja elegida, en orden cronológico (define adyacencia).
 * @param {number} permanenciaMaxima - tope de horas seguidas por bloque en la misma casilla.
 * @param {number} intervaloMinimo - piso de descanso entre bloques.
 * @param {number} rachaMinima - piso de horas por bloque.
 * @param {number} horasMaximas - tope de horas totales del agente en el día (todas las vistas).
 * @param {number} filas - cantidad de filas de la vista.
 * @param {(string|null)[][]} matrizActual - matriz real de la vista (lo ya asignado a mano).
 * @param {Object<string, number[]>} horasOcupadasPorAgente - por agente, horas donde ya está
 *        asignado en CUALQUIER vista del paso (incluida esta). Lo arma el llamador.
 * @param {Object<string, {horaInicio:number, horaFin:number}|null>} ventanasPorAgente - por
 *        agente, su ventana real de guardia (o ausente si no aplica restricción). Ninguna hora
 *        de ningún bloque puede caer fuera de esta ventana.
 * @param {Object<string, string>} categoriasPorAgente - por agente, su categoría efectiva
 *        ('inspector'|'comisionado'|'refuerzo_medio'|'refuerzo_completo'), usada solo para
 *        desempatar candidatos con igual carga.
 *
 * @returns {{ matriz, resumen: {agenteId,horasAsignadas}[], horasSinCubrir: number }}
 */
export function generarAsignacion({
  agentesIds,
  casillasAbiertas,
  ordenHoras,
  permanenciaMaxima,
  intervaloMinimo,
  rachaMinima = 1,
  horasMaximas = Infinity,
  filas,
  matrizActual,
  horasOcupadasPorAgente = {},
  ventanasPorAgente = {},
  categoriasPorAgente = {},
}) {
  const matriz = matrizActual
    ? matrizActual.map((fila) => [...fila])
    : Array(filas).fill().map(() => Array(HORAS_DIA).fill(null));
  while (matriz.length < filas) matriz.push(Array(HORAS_DIA).fill(null));

  if (!agentesIds?.length || !casillasAbiertas?.length || !ordenHoras?.length) {
    return { matriz, resumen: [], horasSinCubrir: 0 };
  }

  const posEnFranja = new Map(ordenHoras.map((h, i) => [h, i]));
  const horasPorCasilla = new Map(casillasAbiertas.map((c) => [c.filaIdx, new Set(c.horas)]));

  const estado = new Map();
  agentesIds.forEach((id) => {
    const horas = new Set(horasOcupadasPorAgente[id] || []);
    estado.set(id, { horasOcupadas: horas, carga: horas.size });
  });

  let horasSinCubrir = 0;
  const excluidas = new Set(); // `${filaIdx}:${hora}` ya descartadas (nadie puede cubrirlas)
  const claveCelda = (filaIdx, hora) => `${filaIdx}:${hora}`;

  // Corrida máxima contigua (en posiciones de ordenHoras) de horas
  // elegibles-y-libres en `filaIdx`, alrededor de la posición `posH`.
  // Define el límite físico dentro del cual un bloque puede crecer en
  // esta casilla, sin todavía considerar reglas propias del agente.
  const corridaLibreEnCasilla = (filaIdx, posH) => {
    const horasCasilla = horasPorCasilla.get(filaIdx);
    const libre = (pos) => {
      if (pos < 0 || pos >= ordenHoras.length) return false;
      const h = ordenHoras[pos];
      if (!horasCasilla.has(h)) return false;
      if (matriz[filaIdx][h] != null) return false;
      if (excluidas.has(claveCelda(filaIdx, h))) return false;
      return true;
    };
    let lo = posH;
    while (libre(lo - 1)) lo--;
    let hi = posH;
    while (libre(hi + 1)) hi++;
    return { lo, hi };
  };

  // Bloque máximo factible para `agenteId` que incluya la hora `h` en
  // `filaIdx`: arranca en esa única hora y crece de a una hora por vez
  // hacia ambos lados (bidireccional) mientras siga siendo válido
  // (ventana, margen de horasMaximas, permanenciaMaxima, intervaloMinimo
  // — vía evaluarTanda) y no se salga de la corrida libre física de la
  // casilla. Devuelve null si ni una hora sola es factible, o si el
  // máximo alcanzado no llega a rachaMinima.
  const maxBloqueFactible = (agenteId, filaIdx, h) => {
    const est = estado.get(agenteId);
    if (est.horasOcupadas.has(h)) return null; // ya ocupado a esa hora en otro lado
    const ventana = ventanasPorAgente[agenteId];
    if (ventana && !dentroDeVentanaCircular(h, ventana.horaInicio, ventana.horaFin)) return null;

    const posH = posEnFranja.get(h);
    const { lo, hi } = corridaLibreEnCasilla(filaIdx, posH);
    const margen = horasMaximas - est.carga;
    if (margen < 1) return null;

    const rangoHoras = (a, b) => {
      const arr = [];
      for (let p = a; p <= b; p++) arr.push(ordenHoras[p]);
      return arr;
    };

    const factible = (a, b) => {
      if (b - a + 1 > margen) return false;
      const horas = rangoHoras(a, b);
      if (horas.some((hh) => est.horasOcupadas.has(hh))) return false; // doble reserva del agente
      if (ventana && horas.some((hh) => !dentroDeVentanaCircular(hh, ventana.horaInicio, ventana.horaFin))) return false;
      return evaluarTanda(est.horasOcupadas, horas, permanenciaMaxima, intervaloMinimo);
    };

    if (!factible(posH, posH)) return null;

    let loPos = posH;
    let hiPos = posH;
    let siguioCreciendo = true;
    while (siguioCreciendo) {
      siguioCreciendo = false;
      if (loPos - 1 >= lo && factible(loPos - 1, hiPos)) {
        loPos--;
        siguioCreciendo = true;
      }
      if (hiPos + 1 <= hi && factible(loPos, hiPos + 1)) {
        hiPos++;
        siguioCreciendo = true;
      }
    }

    const horasFinal = rangoHoras(loPos, hiPos);
    if (horasFinal.length < rachaMinima) return null;
    return horasFinal;
  };

  const candidatosParaCelda = (filaIdx, h) => {
    const resultados = [];
    agentesIds.forEach((id) => {
      const bloque = maxBloqueFactible(id, filaIdx, h);
      if (bloque) resultados.push({ id, bloque });
    });
    return resultados;
  };

  // Bucle principal: MRV puro, sin trocheo previo. En cada paso se
  // procesa la celda libre con MENOS candidatos factibles restantes.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const celdasLibres = [];
    casillasAbiertas.forEach((c) => {
      const horasCasilla = horasPorCasilla.get(c.filaIdx);
      ordenHoras.forEach((h) => {
        if (!horasCasilla.has(h)) return;
        if (matriz[c.filaIdx][h] != null) return;
        if (excluidas.has(claveCelda(c.filaIdx, h))) return;
        celdasLibres.push({ filaIdx: c.filaIdx, hora: h });
      });
    });
    if (celdasLibres.length === 0) break;

    let mejor = null;
    celdasLibres.forEach(({ filaIdx, hora }) => {
      const candidatos = candidatosParaCelda(filaIdx, hora);
      if (!mejor || candidatos.length < mejor.candidatos.length) {
        mejor = { filaIdx, hora, candidatos };
      }
    });

    if (mejor.candidatos.length === 0) {
      excluidas.add(claveCelda(mejor.filaIdx, mejor.hora));
      horasSinCubrir += 1;
      continue;
    }

    mejor.candidatos.sort((a, b) => {
      const estA = estado.get(a.id);
      const estB = estado.get(b.id);
      if (estA.carga !== estB.carga) return estA.carga - estB.carga;
      if (a.bloque.length !== b.bloque.length) return b.bloque.length - a.bloque.length; // bloque más largo primero
      const diffCategoria = prioridadCategoria(categoriasPorAgente[a.id]) - prioridadCategoria(categoriasPorAgente[b.id]);
      if (diffCategoria !== 0) return diffCategoria;
      return agentesIds.indexOf(a.id) - agentesIds.indexOf(b.id);
    });

    const elegido = mejor.candidatos[0];
    const est = estado.get(elegido.id);
    elegido.bloque.forEach((h) => {
      matriz[mejor.filaIdx][h] = elegido.id;
      est.horasOcupadas.add(h);
    });
    est.carga += elegido.bloque.length;
  }

  const resumen = agentesIds.map((id) => ({ agenteId: id, horasAsignadas: estado.get(id).carga }));
  return { matriz, resumen, horasSinCubrir };
}
