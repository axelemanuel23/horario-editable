// =========================================================
// MOTOR DE DISTRIBUCIÓN AUTOMÁTICA DE CASILLAS
//
// Pura (sin React/localStorage). Recibe el estado real de la matriz
// (lo ya asignado a mano) y arma tandas para las horas libres,
// respetando SIEMPRE:
//   - permanenciaMaxima: tope de horas seguidas por tanda.
//   - rachaMinima: piso de horas por tanda (si un tramo libre no da
//     para una tanda mínima, queda como hueco entero).
//   - intervaloMinimo: piso de descanso entre tandas del mismo agente.
//   - horasMaximas: tope de horas totales del agente en el día,
//     contando TODAS las vistas del paso (lo pasa el llamador).
//
// No fuerza cobertura: ante cualquier tramo o tanda sin candidato
// válido, queda como hueco para que el usuario lo resuelva a mano.
//
// Tamaño de tanda: en vez de ir siempre al máximo permitido, se
// calcula un objetivo = piso(demanda total / cantidad de agentes),
// recortado a [rachaMinima, permanenciaMaxima]. Así, si la demanda da
// para tandas cortas, reparte entre más gente en vez de agotar el
// máximo con unos pocos.
// =========================================================

const HORAS_DIA = 24;

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

// Agrupa ordenHoras en bloques de horas consecutivas que estén en
// horasLibresSet (ya filtradas contra la matriz real por el llamador
// de esta función interna).
function agruparBloques(ordenHoras, horasLibresSet) {
  const bloques = [];
  let actual = null;
  ordenHoras.forEach((hora) => {
    if (horasLibresSet.has(hora)) {
      if (actual) actual.push(hora);
      else actual = [hora];
    } else {
      if (actual) bloques.push(actual);
      actual = null;
    }
  });
  if (actual) bloques.push(actual);
  return bloques;
}

// Trocea un bloque de horas consecutivas en tandas de tamaño
// `objetivo`, respetando max y min. La última porción, si no llega al
// mínimo, se absorbe en la tanda anterior (si entra bajo el máximo);
// si no entra, queda como hueco.
function trocearBloque(horas, objetivo, max, min) {
  if (horas.length < min) {
    return { tandas: [], horasSinCubrir: horas.length };
  }
  const tandas = [];
  let cursor = 0;
  let resto = horas.length;
  while (resto > 0) {
    if (resto <= max) {
      if (resto >= min) {
        tandas.push(horas.slice(cursor, cursor + resto));
      } else if (tandas.length > 0 && tandas[tandas.length - 1].length + resto <= max) {
        tandas[tandas.length - 1] = tandas[tandas.length - 1].concat(horas.slice(cursor, cursor + resto));
      } else {
        return { tandas, horasSinCubrir: resto };
      }
      cursor += resto;
      resto = 0;
    } else {
      tandas.push(horas.slice(cursor, cursor + objetivo));
      cursor += objetivo;
      resto -= objetivo;
    }
  }
  return { tandas, horasSinCubrir: 0 };
}

// ¿Puede este agente tomar la tanda completa (rango contiguo de
// horas) sin romper permanencia máxima ni intervalo mínimo, dado su
// set de horas ya ocupadas (en todas las vistas)?
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
 * @param {string[]} agentesIds - orden de prioridad para desempatar por igual carga.
 * @param {Array<{filaIdx:number, horas:number[]}>} casillasAbiertas - horas a intentar cubrir por casilla.
 * @param {number[]} ordenHoras - horas del turno, en orden cronológico.
 * @param {number} permanenciaMaxima - tope de horas seguidas por tanda.
 * @param {number} intervaloMinimo - piso de descanso entre tandas.
 * @param {number} rachaMinima - piso de horas por tanda.
 * @param {number} horasMaximas - tope de horas totales del agente en el día (todas las vistas).
 * @param {number} filas - cantidad de filas de la vista.
 * @param {(string|null)[][]} matrizActual - matriz real de la vista (lo ya asignado a mano).
 * @param {Object<string, number[]>} horasOcupadasPorAgente - por agente, horas donde ya está
 *        asignado en CUALQUIER vista del paso (incluida esta). Lo arma el llamador, que es quien
 *        conoce la estructura de vistas/pasos.
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
}) {
  const matriz = matrizActual
    ? matrizActual.map((fila) => [...fila])
    : Array(filas).fill().map(() => Array(HORAS_DIA).fill(null));
  while (matriz.length < filas) matriz.push(Array(HORAS_DIA).fill(null));

  if (!agentesIds?.length || !casillasAbiertas?.length || !ordenHoras?.length) {
    return { matriz, resumen: [], horasSinCubrir: 0 };
  }

  const estado = new Map();
  agentesIds.forEach((id) => {
    const horas = new Set(horasOcupadasPorAgente[id] || []);
    estado.set(id, { horasOcupadas: horas, carga: horas.size });
  });

  // 1) Bloques de horas libres realmente abiertas, por casilla.
  const bloquesPorCasilla = casillasAbiertas.map((c) => {
    const horasLibresSet = new Set(
      ordenHoras.filter((h) => c.horas.includes(h) && matriz[c.filaIdx]?.[h] == null)
    );
    return { filaIdx: c.filaIdx, bloques: agruparBloques(ordenHoras, horasLibresSet) };
  });

  // 2) Demanda total (horas libres crudas) -> tanda objetivo.
  const demandaTotal = bloquesPorCasilla.reduce(
    (acc, c) => acc + c.bloques.reduce((a, b) => a + b.length, 0),
    0
  );
  if (demandaTotal === 0) {
    return {
      matriz,
      resumen: agentesIds.map((id) => ({ agenteId: id, horasAsignadas: estado.get(id).carga })),
      horasSinCubrir: 0,
    };
  }

  const objetivoBruto = Math.floor(demandaTotal / agentesIds.length) || rachaMinima;
  const objetivo = Math.min(permanenciaMaxima, Math.max(rachaMinima, objetivoBruto));

  // 3) Trocear cada bloque en tandas del tamaño objetivo.
  let horasSinCubrir = 0;
  const tandasAAsignar = []; // { filaIdx, horas: number[] }
  bloquesPorCasilla.forEach(({ filaIdx, bloques }) => {
    bloques.forEach((bloque) => {
      const { tandas, horasSinCubrir: sinCubrirBloque } = trocearBloque(bloque, objetivo, permanenciaMaxima, rachaMinima);
      horasSinCubrir += sinCubrirBloque;
      tandas.forEach((horas) => tandasAAsignar.push({ filaIdx, horas }));
    });
  });

  // 4) Procesar tandas en orden cronológico (por su hora de inicio),
  // para que decisiones tempranas condicionen correctamente a las
  // siguientes, sin importar de qué casilla vengan.
  tandasAAsignar.sort((a, b) => ordenHoras.indexOf(a.horas[0]) - ordenHoras.indexOf(b.horas[0]));

  tandasAAsignar.forEach(({ filaIdx, horas }) => {
    const candidatos = agentesIds.filter((id) => {
      const est = estado.get(id);
      if (horas.some((h) => est.horasOcupadas.has(h))) return false; // ya ocupado a esa hora en otro lado
      if (est.carga + horas.length > horasMaximas) return false;
      return evaluarTanda(est.horasOcupadas, horas, permanenciaMaxima, intervaloMinimo);
    });

    if (candidatos.length === 0) {
      horasSinCubrir += horas.length;
      return;
    }

    candidatos.sort((a, b) => {
      const diff = estado.get(a).carga - estado.get(b).carga;
      return diff !== 0 ? diff : agentesIds.indexOf(a) - agentesIds.indexOf(b);
    });

    const elegido = candidatos[0];
    const est = estado.get(elegido);
    horas.forEach((h) => {
      matriz[filaIdx][h] = elegido;
      est.horasOcupadas.add(h);
    });
    est.carga += horas.length;
  });

  const resumen = agentesIds.map((id) => ({ agenteId: id, horasAsignadas: estado.get(id).carga }));
  return { matriz, resumen, horasSinCubrir };
}
