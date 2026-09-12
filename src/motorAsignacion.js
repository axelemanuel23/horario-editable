// =========================================================
// MOTOR DE DISTRIBUCIÓN AUTOMÁTICA DE CASILLAS
//
// Pura (sin React/localStorage). Recibe el estado real de la matriz
// (lo ya asignado a mano) y busca la mejor cobertura posible de las
// horas libres, respetando SIEMPRE:
//   - permanenciaMaxima: tope de horas seguidas por agente en la misma
//     casilla (una "racha").
//   - rachaMinima: piso de horas de una racha nueva (si no se puede
//     armar al menos este tamaño para un agente en una celda, ese
//     agente queda descartado para esa celda — nunca se fuerza).
//   - intervaloMinimo: piso de descanso entre rachas del mismo agente.
//   - horasMaximas: tope de horas totales del agente en el día,
//     contando TODAS las vistas del paso (lo pasa el llamador).
//   - ventanasPorAgente: ventana real de guardia de cada agente. Ninguna
//     hora de ninguna racha puede caer fuera de ella.
//
// No fuerza cobertura: ante cualquier hora sin candidato válido, queda
// como hueco para que el usuario lo resuelva a mano.
//
// MODELO: no hay bloques ni turnos precalculados. Cada hora-en-casilla
// es una celda atómica a cubrir. El motor prueba distintas
// combinaciones y, si una combinación termina generando más huecos de
// los necesarios, VUELVE ATRÁS y prueba otra — backtracking con poda
// (branch & bound) sobre un problema de satisfacción de restricciones
// (CSP), guiado por MRV (minimum remaining values: en cada paso se
// elige a propósito la celda con MENOS alternativas posibles, para no
// "gastar" mal a un agente muy restringido en una celda que tenía
// muchas opciones).
//
// Por qué hace falta volver atrás (y no alcanza con un "greedy" que
// nunca se arrepiente): asignar la mejor opción LOCAL en una celda
// puede dejar sin nadie disponible a otra celda más adelante que
// dependía justo de ese agente. Backtracking prueba alternativas y se
// queda con la que, al completar TODO el tablero, resulta mejor.
//
// Objetivo, en este orden (empatan en el primero -> desempata el
// segundo, y así):
//   1) MENOS huecos totales (siempre lo más importante).
//   2) Carga MÁS PAREJA entre todos los agentes del pool (varianza de
//      horas asignadas — cuanto más baja, más parejo).
//   3) MENOS veces que un mismo agente repite la MISMA casilla en
//      tramos separados del día — se evita cuando se puede, pero se
//      permite como último recurso si hace falta para no dejar huecos
//      o para repartir mejor la carga.
//
// Límites de cómputo (tunables acá abajo): para que esto no cuelgue el
// navegador con instancias grandes, la búsqueda deja de explorar
// alternativas NUEVAS al llegar a LIMITE_NODOS nodos o a
// TIEMPO_LIMITE_MS de reloj, y devuelve la mejor solución encontrada
// hasta ese momento — no necesariamente la óptima absoluta, pero sí
// una búsqueda real con vuelta atrás, no un simple orden de un greedy.
// =========================================================

const HORAS_DIA = 24;

const PRIORIDAD_CATEGORIA = ['refuerzo_medio', 'refuerzo_completo', 'comisionado', 'inspector'];
function prioridadCategoria(categoria) {
  const idx = PRIORIDAD_CATEGORIA.indexOf(categoria);
  return idx === -1 ? PRIORIDAD_CATEGORIA.length : idx; // categoría desconocida: al final, sin romper
}

// Subir estos valores explora más alternativas (mejor resultado
// posible) a costa de más tiempo de cómputo en el navegador.
const LIMITE_NODOS = 8000;
const TIEMPO_LIMITE_MS = 4000;
const MAX_ALTERNATIVAS_POR_NODO = 5;

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

// ¿Es válido asignarle a este agente el rango [inicio,fin] (horas
// reales, ya contiguas), dado su set de horas ya ocupadas? Si el rango
// queda pegado a una racha ya existente del mismo agente, se fusionan
// a los fines de permanenciaMaxima (es una sola racha real más larga).
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
 * @param {Array<{filaIdx:number, horas:number[]}>} casillasAbiertas - horas a intentar cubrir por casilla.
 * @param {number[]} ordenHoras - horas de la franja elegida, en orden cronológico (define adyacencia).
 * @param {number} permanenciaMaxima - tope de horas seguidas por agente en la misma casilla.
 * @param {number} intervaloMinimo - piso de descanso entre rachas.
 * @param {number} rachaMinima - piso de horas de una racha nueva.
 * @param {number} horasMaximas - tope de horas totales del agente en el día (todas las vistas).
 * @param {number} filas - cantidad de filas de la vista.
 * @param {(string|null)[][]} matrizActual - matriz real de la vista (lo ya asignado a mano).
 * @param {Object<string, number[]>} horasOcupadasPorAgente - por agente, horas donde ya está
 *        asignado en CUALQUIER vista del paso (incluida esta). Lo arma el llamador.
 * @param {Object<string, {horaInicio:number, horaFin:number}|null>} ventanasPorAgente - por
 *        agente, su ventana real de guardia. Ninguna hora de ninguna racha puede caer fuera de ella.
 * @param {Object<string, string>} categoriasPorAgente - por agente, su categoría efectiva, usada
 *        solo como desempate final entre alternativas equivalentes.
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

  // ---- estado mutable de la búsqueda (con undo para el backtracking) ----
  const estado = new Map();
  agentesIds.forEach((id) => {
    const horas = new Set(horasOcupadasPorAgente[id] || []);
    estado.set(id, { horasOcupadas: horas, carga: horas.size });
  });
  // Por agente, cuántas horas lleva asignadas en CADA casilla en esta
  // corrida — solo para la heurística "evitar repetir casilla".
  const casillasPorAgente = new Map(agentesIds.map((id) => [id, new Map()]));

  const demandaTotal = casillasAbiertas.reduce((acc, c) => acc + c.horas.length, 0);
  if (demandaTotal === 0) {
    return {
      matriz,
      resumen: agentesIds.map((id) => ({ agenteId: id, horasAsignadas: estado.get(id).carga })),
      horasSinCubrir: 0,
    };
  }

  const excluidas = new Set(); // `${filaIdx}:${hora}` marcadas hueco en la rama actual
  const claveCelda = (filaIdx, hora) => `${filaIdx}:${hora}`;

  let nodosExplorados = 0;
  let agotado = false; // true al llegar al límite de cómputo: de ahí en más, sin más backtracking
  const tiempoInicio = Date.now();

  let mejor = null; // { matriz, resumen, huecos, balance, repeticiones }

  // ---- helpers geométricos/de factibilidad ----

  const rangoHoras = (a, b) => {
    const arr = [];
    for (let p = a; p <= b; p++) arr.push(ordenHoras[p]);
    return arr;
  };

  // Corrida máxima contigua (en posiciones de ordenHoras) de horas
  // elegibles-y-libres en `filaIdx`, alrededor de la posición `posH`.
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

  // ¿Puede agenteId tomar el rango [a,b] (posiciones en ordenHoras)?
  const esFactible = (agenteId, a, b) => {
    const est = estado.get(agenteId);
    const longitud = b - a + 1;
    if (longitud > horasMaximas - est.carga) return false;
    const horas = rangoHoras(a, b);
    if (horas.some((h) => est.horasOcupadas.has(h))) return false; // doble reserva del agente
    const ventana = ventanasPorAgente[agenteId];
    if (ventana && horas.some((h) => !dentroDeVentanaCircular(h, ventana.horaInicio, ventana.horaFin))) return false;
    return evaluarTanda(est.horasOcupadas, horas, permanenciaMaxima, intervaloMinimo);
  };

  // ¿Al menos una hora sola es factible para este agente en esta celda?
  // Condición necesaria para cualquier bloque más largo que la
  // contenga — sirve de filtro barato para MRV y para descartar
  // agentes de entrada.
  const factibleUnaHora = (agenteId, filaIdx, hora) => {
    const est = estado.get(agenteId);
    if (est.horasOcupadas.has(hora)) return false;
    const ventana = ventanasPorAgente[agenteId];
    if (ventana && !dentroDeVentanaCircular(hora, ventana.horaInicio, ventana.horaFin)) return false;
    const posH = posEnFranja.get(hora);
    return esFactible(agenteId, posH, posH);
  };

  // Máximo bloque factible creciendo bidireccionalmente desde `hora`,
  // de a una hora por vez — una de las alternativas ofrecidas a la
  // búsqueda, junto con los anclajes de tamaño variable de abajo.
  const bloqueMaximoBidireccional = (agenteId, posH, lo, hi) => {
    if (!esFactible(agenteId, posH, posH)) return null;
    let a = posH;
    let b = posH;
    let siguioCreciendo = true;
    while (siguioCreciendo) {
      siguioCreciendo = false;
      if (a - 1 >= lo && esFactible(agenteId, a - 1, b)) {
        a--;
        siguioCreciendo = true;
      }
      if (b + 1 <= hi && esFactible(agenteId, a, b + 1)) {
        b++;
        siguioCreciendo = true;
      }
    }
    return { a, b };
  };

  // Alternativas de bloque para agenteId en (filaIdx, hora): el máximo
  // bidireccional, MÁS variantes ancladas en `hora` (como inicio o
  // como fin del bloque) de distintos tamaños — esto es lo que le
  // permite a la búsqueda replicar el tipo de ajuste manual de "usar
  // una tanda de 1 hora acá para no generar un hueco más adelante", en
  // vez de siempre ir al máximo posible.
  const alternativasParaAgente = (agenteId, filaIdx, hora) => {
    const posH = posEnFranja.get(hora);
    const { lo, hi } = corridaLibreEnCasilla(filaIdx, posH);
    const vistos = new Set();
    const bloques = [];

    const agregar = (a, b) => {
      const clave = `${a}:${b}`;
      if (vistos.has(clave)) return;
      vistos.add(clave);
      bloques.push(rangoHoras(a, b));
    };

    const maximo = bloqueMaximoBidireccional(agenteId, posH, lo, hi);
    if (!maximo) return [];
    agregar(maximo.a, maximo.b);

    const largoMax = Math.min(permanenciaMaxima, hi - lo + 1);
    for (let largo = largoMax; largo >= Math.max(1, rachaMinima); largo--) {
      const bIni = Math.min(posH + largo - 1, hi);
      if (esFactible(agenteId, posH, bIni)) agregar(posH, bIni);
      const aFin = Math.max(posH - largo + 1, lo);
      if (esFactible(agenteId, aFin, posH)) agregar(aFin, posH);
    }

    return bloques.filter((b) => b.length >= rachaMinima);
  };

  // ---- elección de celda (MRV) ----

  const celdasLibresActuales = () => {
    const lista = [];
    casillasAbiertas.forEach((c) => {
      const horasCasilla = horasPorCasilla.get(c.filaIdx);
      ordenHoras.forEach((h) => {
        if (!horasCasilla.has(h)) return;
        if (matriz[c.filaIdx][h] != null) return;
        if (excluidas.has(claveCelda(c.filaIdx, h))) return;
        lista.push({ filaIdx: c.filaIdx, hora: h });
      });
    });
    return lista;
  };

  const contarCandidatos = (filaIdx, hora) =>
    agentesIds.reduce((acc, id) => acc + (factibleUnaHora(id, filaIdx, hora) ? 1 : 0), 0);

  // ---- orden de exploración de alternativas en un nodo ----

  const ordenarAlternativas = (opciones) =>
    opciones.sort((x, y) => {
      const yaRepiteX = (casillasPorAgente.get(x.agenteId).get(x.filaIdx) || 0) > 0 ? 1 : 0;
      const yaRepiteY = (casillasPorAgente.get(y.agenteId).get(y.filaIdx) || 0) > 0 ? 1 : 0;
      if (yaRepiteX !== yaRepiteY) return yaRepiteX - yaRepiteY; // no-repetido primero
      const cargaX = estado.get(x.agenteId).carga;
      const cargaY = estado.get(y.agenteId).carga;
      if (cargaX !== cargaY) return cargaX - cargaY; // menor carga primero
      if (x.bloque.length !== y.bloque.length) return y.bloque.length - x.bloque.length; // bloque más largo primero
      const catX = prioridadCategoria(categoriasPorAgente[x.agenteId]);
      const catY = prioridadCategoria(categoriasPorAgente[y.agenteId]);
      if (catX !== catY) return catX - catY;
      return agentesIds.indexOf(x.agenteId) - agentesIds.indexOf(y.agenteId);
    });

  // ---- aplicar / deshacer una asignación (para el backtracking) ----

  const aplicar = (agenteId, filaIdx, bloque) => {
    const est = estado.get(agenteId);
    bloque.forEach((h) => {
      matriz[filaIdx][h] = agenteId;
      est.horasOcupadas.add(h);
    });
    est.carga += bloque.length;
    const mapaCasillas = casillasPorAgente.get(agenteId);
    mapaCasillas.set(filaIdx, (mapaCasillas.get(filaIdx) || 0) + bloque.length);
  };

  const deshacer = (agenteId, filaIdx, bloque) => {
    const est = estado.get(agenteId);
    bloque.forEach((h) => {
      matriz[filaIdx][h] = null;
      est.horasOcupadas.delete(h);
    });
    est.carga -= bloque.length;
    const mapaCasillas = casillasPorAgente.get(agenteId);
    mapaCasillas.set(filaIdx, (mapaCasillas.get(filaIdx) || 0) - bloque.length);
  };

  // ---- evaluación de una solución completa (hoja del árbol) ----

  function varianzaCarga() {
    const cargas = agentesIds.map((id) => estado.get(id).carga);
    const media = cargas.reduce((a, b) => a + b, 0) / cargas.length;
    return cargas.reduce((acc, c) => acc + (c - media) * (c - media), 0) / cargas.length;
  }

  // Cuenta, por cada (agente, casilla) de esta corrida, cuántas rachas
  // separadas (no contiguas) tiene en la matriz final dentro de la
  // franja elegida — cada racha de más por encima de la primera es una
  // "repetición de casilla".
  function contarRepeticiones() {
    let repeticiones = 0;
    casillasAbiertas.forEach((c) => {
      const fila = matriz[c.filaIdx];
      const rachasPorAgente = new Map();
      let anterior = null;
      ordenHoras.forEach((h) => {
        const id = fila[h];
        if (id && id !== anterior) {
          rachasPorAgente.set(id, (rachasPorAgente.get(id) || 0) + 1);
        }
        anterior = id;
      });
      rachasPorAgente.forEach((cantidad) => {
        if (cantidad > 1) repeticiones += cantidad - 1;
      });
    });
    return repeticiones;
  }

  function registrarSiEsMejor(huecos) {
    const candidata = { huecos, balance: varianzaCarga(), repeticiones: contarRepeticiones() };
    const esMejor =
      !mejor ||
      candidata.huecos < mejor.huecos ||
      (candidata.huecos === mejor.huecos && candidata.balance < mejor.balance) ||
      (candidata.huecos === mejor.huecos && candidata.balance === mejor.balance && candidata.repeticiones < mejor.repeticiones);
    if (!esMejor) return;
    mejor = {
      ...candidata,
      matriz: matriz.map((fila) => [...fila]),
      resumen: agentesIds.map((id) => ({ agenteId: id, horasAsignadas: estado.get(id).carga })),
    };
  }

  // ---- búsqueda recursiva (backtracking + MRV + poda) ----

  function backtrack(huecosActuales) {
    nodosExplorados++;
    if (!agotado && (nodosExplorados > LIMITE_NODOS || Date.now() - tiempoInicio > TIEMPO_LIMITE_MS)) {
      agotado = true; // de acá en más: sin más backtracking, solo completar con la mejor opción local
    }

    const libres = celdasLibresActuales();
    if (libres.length === 0) {
      registrarSiEsMejor(huecosActuales);
      return;
    }

    // Poda: si ya llevamos más huecos que la mejor solución encontrada,
    // esta rama no puede superarla (los huecos nunca bajan al avanzar).
    if (mejor && huecosActuales > mejor.huecos) return;

    // MRV: elegir la celda libre con menos candidatos posibles ahora.
    let celdaElegida = libres[0];
    let menorCandidatos = contarCandidatos(celdaElegida.filaIdx, celdaElegida.hora);
    for (let i = 1; i < libres.length; i++) {
      if (menorCandidatos === 0) break; // no hay peor que 0
      const cantidad = contarCandidatos(libres[i].filaIdx, libres[i].hora);
      if (cantidad < menorCandidatos) {
        menorCandidatos = cantidad;
        celdaElegida = libres[i];
      }
    }

    const { filaIdx, hora } = celdaElegida;

    if (menorCandidatos === 0) {
      const clave = claveCelda(filaIdx, hora);
      excluidas.add(clave);
      backtrack(huecosActuales + 1);
      excluidas.delete(clave);
      return;
    }

    let opciones = [];
    agentesIds.forEach((agenteId) => {
      if (!factibleUnaHora(agenteId, filaIdx, hora)) return;
      alternativasParaAgente(agenteId, filaIdx, hora).forEach((bloque) => {
        opciones.push({ agenteId, filaIdx, bloque });
      });
    });
    opciones = ordenarAlternativas(opciones);

    const tope = Math.min(opciones.length, MAX_ALTERNATIVAS_POR_NODO);
    for (let i = 0; i < tope; i++) {
      const { agenteId, bloque } = opciones[i];
      aplicar(agenteId, filaIdx, bloque);
      backtrack(huecosActuales);
      deshacer(agenteId, filaIdx, bloque);
      if (agotado) break; // presupuesto de cómputo agotado: no probar más hermanos
    }
  }

  backtrack(0);

  return mejor
    ? { matriz: mejor.matriz, resumen: mejor.resumen, horasSinCubrir: mejor.huecos }
    : {
        matriz,
        resumen: agentesIds.map((id) => ({ agenteId: id, horasAsignadas: estado.get(id).carga })),
        horasSinCubrir: demandaTotal,
      };
}
