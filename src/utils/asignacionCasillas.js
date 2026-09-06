// utils/asignacionCasillas.js
//
// Lógica pura (sin React) para diagnosticar y resolver conflictos al
// soltar un agente sobre una celda de la grilla (drag & drop), ya sea
// desde el panel de equipos o desde otra celda de la matriz.
//
// Flujo: diagnosticarDrop() arma un diagnóstico completo ANTES de tocar
// nada -> resolverTipoModal() decide qué modal mostrar (o ninguno) según
// prioridad -> aplicarResolucion() calcula las matrices nuevas una vez
// que el usuario confirma (o se aplica directo si no hacía falta modal).

const HORAS_DIA = 24;

export function matrizKey(pasoId, vistaId) {
  return `${pasoId}:${vistaId}`;
}

// Busca en qué vista/fila está agenteId asignado en columnaAbsoluta,
// excluyendo opcionalmente una vista+fila puntual (para no matchear
// contra la propia celda de origen del agente que se está moviendo).
export function buscarConflicto(matrices, pasoActual, columnaAbsoluta, agenteId, vistaExcluida, filaExcluida) {
  if (!pasoActual) return null;
  for (const vista of pasoActual.vistas) {
    const matriz = matrices[matrizKey(pasoActual.id, vista.id)];
    if (!matriz) continue;
    for (let filaIdx = 0; filaIdx < matriz.length; filaIdx++) {
      if (vista.id === vistaExcluida && filaIdx === filaExcluida) continue;
      if (matriz[filaIdx][columnaAbsoluta] === agenteId) {
        return { vistaId: vista.id, vistaNombre: vista.nombre, filaIdx, casillaNombre: vista.casillas[filaIdx]?.nombre };
      }
    }
  }
  return null;
}

// true si agenteId quedaría con 3 o más horas seguidas en columnaAbsoluta
// (mirando hacia atrás y hacia adelante dentro de matriz).
export function verificarHorasConsecutivas(matriz, columnaAbsoluta, agenteId) {
  let horasConsecutivas = 1;
  let i = (columnaAbsoluta + HORAS_DIA - 1) % HORAS_DIA;
  let pasosCount = 0;
  while (pasosCount < HORAS_DIA - 1) {
    const columnaChequeada = i;
    if (!matriz.some((row) => row[columnaChequeada] === agenteId)) break;
    horasConsecutivas++;
    i = (i + HORAS_DIA - 1) % HORAS_DIA;
    pasosCount++;
  }
  i = (columnaAbsoluta + 1) % HORAS_DIA;
  pasosCount = 0;
  while (pasosCount < HORAS_DIA - 1) {
    const columnaChequeada = i;
    if (!matriz.some((row) => row[columnaChequeada] === agenteId)) break;
    horasConsecutivas++;
    i = (i + 1) % HORAS_DIA;
    pasosCount++;
  }
  return horasConsecutivas >= 3;
}

// Arma el diagnóstico completo de un drop, SIN modificar nada.
//
// origen: { panel: true } si viene del panel de equipos,
//         { panel: false, fila, columna } si viene de otra celda de
//         la matriz de vistaActual (columna ya es la hora absoluta).
export function diagnosticarDrop({
  matrices,
  pasoActual,
  vistaActual,
  matrizActual, // matriz (2D) de vistaActual, tal como está ANTES del drop
  porAgente,    // operativoPaso.porAgente
  agenteId,
  filaDestino,
  columnaDestino,
  origen,
}) {
  const esOrigenMatriz = !origen.panel;
  const vistaExcluida = esOrigenMatriz ? vistaActual.id : null;
  const filaExcluida = esOrigenMatriz ? origen.fila : null;

  // A: ¿el agente que arrastro ya está en otra casilla/vista a esta hora?
  const conflictoEntrante = buscarConflicto(
    matrices, pasoActual, columnaDestino, agenteId, vistaExcluida, filaExcluida
  );

  const ocupanteEnCelda = matrizActual[filaDestino]?.[columnaDestino] || null;
  const hayOcupante = !!ocupanteEnCelda && ocupanteEnCelda !== agenteId;

  const multiplesVistas = pasoActual.vistas.length > 1;
  const registroOcupante = hayOcupante ? porAgente[ocupanteEnCelda] : null;
  const ocupanteEsPrestamo = !!(
    hayOcupante &&
    multiplesVistas &&
    registroOcupante?.vistaPrincipal &&
    registroOcupante.vistaPrincipal !== vistaActual.id
  );

  // Solo hay intercambio real si viene de la matriz y el ocupante NO es
  // préstamo (a un préstamo se lo saca directo, no se lo "intercambia").
  const esIntercambio = esOrigenMatriz && hayOcupante && !ocupanteEsPrestamo;

  let conflictoDesplazado = null;
  let horasConsecutivasDesplazado = false;
  if (esIntercambio) {
    // ¿El desplazado ya está en otro lado a la hora de origen (adonde
    // iría a parar tras el intercambio)?
    conflictoDesplazado = buscarConflicto(
      matrices, pasoActual, origen.columna, ocupanteEnCelda, vistaActual.id, filaDestino
    );
    if (!conflictoDesplazado) {
      horasConsecutivasDesplazado = verificarHorasConsecutivas(matrizActual, origen.columna, ocupanteEnCelda);
    }
  }

  const horasConsecutivasEntrante =
    !conflictoEntrante && verificarHorasConsecutivas(matrizActual, columnaDestino, agenteId);

  return {
    agenteId,
    ocupanteId: hayOcupante ? ocupanteEnCelda : null,
    ocupanteEsPrestamo,
    esIntercambio,
    conflictoEntrante,
    conflictoDesplazado,
    horasConsecutivasEntrante,
    horasConsecutivasDesplazado,
  };
}

// Traduce el diagnóstico a qué modal corresponde mostrar, respetando
// prioridad: conflicto de entrante > bloqueo de intercambio > préstamo >
// reemplazo/intercambio simple > horas consecutivas > nada.
export function resolverTipoModal(diagnostico) {
  const { conflictoEntrante, esIntercambio, conflictoDesplazado, ocupanteEsPrestamo, ocupanteId } = diagnostico;

  if (conflictoEntrante) return 'conflictoEntrante';
  if (esIntercambio && conflictoDesplazado) return 'bloqueoIntercambio';
  if (ocupanteEsPrestamo) return 'avisoPrestamo';
  if (ocupanteId && esIntercambio) return 'confirmarIntercambio';
  if (ocupanteId && !esIntercambio) return 'confirmarReemplazo';
  if (diagnostico.horasConsecutivasEntrante) return 'confirmarHorasConsecutivas';
  return null;
}

// Calcula las matrices nuevas para el tipo de resolución elegido.
// No aplica 'bloqueoIntercambio' ni cancelaciones: esos casos se
// resuelven en el componente simplemente cerrando el modal.
export function crearMatrizVacia(filas) {
  return Array(filas).fill().map(() => Array(HORAS_DIA).fill(null));
}
export function aplicarResolucion(tipo, diagnostico, params) {
  const { matrices, pasoActual, vistaActual, agenteId, filaDestino, columnaDestino, origen } = params;
  const key = matrizKey(pasoActual.id, vistaActual.id);
  const filasNecesarias = vistaActual.casillas.length;
  const guardada = matrices[key];
  const matrizActual = guardada
    ? (guardada.length >= filasNecesarias
        ? guardada.map((row) => [...row])
        : [...guardada.map((row) => [...row]), ...crearMatrizVacia(filasNecesarias - guardada.length)])
    : crearMatrizVacia(filasNecesarias);

  const limpiarOrigenSiCorresponde = () => {
    if (!origen.panel) {
      matrizActual[origen.fila][origen.columna] = null;
    }
  };

  switch (tipo) {
    case 'directo':
    case 'confirmarHorasConsecutivas':
    case 'avisoPrestamo':
    case 'confirmarReemplazo': {
      limpiarOrigenSiCorresponde();
      matrizActual[filaDestino][columnaDestino] = agenteId;
      return { ...matrices, [key]: matrizActual };
    }

    case 'confirmarIntercambio': {
      const ocupanteId = diagnostico.ocupanteId;
      matrizActual[origen.fila][origen.columna] = ocupanteId;
      matrizActual[filaDestino][columnaDestino] = agenteId;
      return { ...matrices, [key]: matrizActual };
    }

    case 'conflictoReasignar': {
      // Saca al agente de donde estaba en conflicto y lo trae acá.
      const conflicto = diagnostico.conflictoEntrante;
      const nuevasMatrices = { ...matrices };
      const keyConflicto = matrizKey(pasoActual.id, conflicto.vistaId);

      if (keyConflicto === key) {
        // Mismo vista: limpiar directo sobre la matriz que ya clonamos,
        // para no pisarla después al escribir nuevasMatrices[key].
        if (matrizActual[conflicto.filaIdx]) matrizActual[conflicto.filaIdx][columnaDestino] = null;
      } else {
        const matrizConflicto = (nuevasMatrices[keyConflicto] || []).map((row) => [...row]);
        if (matrizConflicto[conflicto.filaIdx]) matrizConflicto[conflicto.filaIdx][columnaDestino] = null;
        nuevasMatrices[keyConflicto] = matrizConflicto;
      }

      limpiarOrigenSiCorresponde();
      matrizActual[filaDestino][columnaDestino] = agenteId;
      nuevasMatrices[key] = matrizActual;
      return nuevasMatrices;
    }

    default:
      return matrices;
  }
}
