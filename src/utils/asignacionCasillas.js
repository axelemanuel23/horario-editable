// utils/asignacionCasillas.js
//
// Lógica pura (sin React) para diagnosticar y resolver conflictos al
// soltar un agente sobre una celda de la grilla (drag & drop), ya sea
// desde el panel de equipos, del panel "Casilla", o desde otra celda
// de la matriz.
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
// excluyendo opcionalmente una vista+fila+columna puntual (para no
// matchear contra la propia celda de origen del agente que se está
// moviendo).
export function buscarConflicto(matrices, pasoActual, columnaAbsoluta, agenteId, vistaExcluida, filaExcluida, columnaExcluida) {
  if (!pasoActual) return null;
  for (const vista of pasoActual.vistas) {
    const matriz = matrices[matrizKey(pasoActual.id, vista.id)];
    if (!matriz) continue;
    for (let filaIdx = 0; filaIdx < matriz.length; filaIdx++) {
      const esCeldaExcluida =
        vista.id === vistaExcluida && filaIdx === filaExcluida && columnaAbsoluta === columnaExcluida;
      if (esCeldaExcluida) continue;
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

// ¿`hora` cae dentro de la ventana [inicio, fin) circular (contempla
// turnos que cruzan medianoche)? Sin ventana definida (null), no hay
// restricción.
function dentroDeVentanaCircular(hora, inicio, fin) {
  if (inicio == null || fin == null) return true;
  if (inicio === fin) return true; // ventana de 24hs completas
  if (inicio < fin) return hora >= inicio && hora < fin;
  return hora >= inicio || hora < fin; // cruza medianoche
}

// Duración de guardia por categoría, según lo definido operativamente:
// inspector 10hs, comisionado 8hs, refuerzo medio 4hs, refuerzo completo 8hs.
// Exportado para que PasoManager.js lo use al armar el catálogo de
// horarios de entrada, sin duplicar estos números en otro archivo.
export const DURACION_CATEGORIA = {
  inspector: 10,
  comisionado: 8,
  refuerzo_medio: 4,
  refuerzo_completo: 8,
};

// Arma { horaInicio, horaFin } a partir del registro operativo de un
// agente, o null si no tiene un horario de entrada asignado todavía.
// Aplica a CUALQUIER categoría (inspector/comisionado/refuerzo) — ya
// no es exclusivo de refuerzos: cualquier agente con horario cargado
// tiene una ventana real que la matriz debe respetar.
function ventanaHorarioDe(registro) {
  if (!registro?.horario) return null;
  const { categoria, horaInicio } = registro.horario;
  const duracion = DURACION_CATEGORIA[categoria] || 0;
  if (horaInicio == null || !duracion) return null;
  return { horaInicio, horaFin: (horaInicio + duracion) % HORAS_DIA };
}

// Arma el diagnóstico completo de un drop, SIN modificar nada.
//
// origen: { panel: true } si viene del panel de equipos o del panel
//         "Casilla" (sin celda de origen real en la grilla),
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

  // 0: ¿el agente que arrastro es un refuerzo con ventana horaria, y
  // la hora destino cae fuera de esa ventana? Es un límite operativo
  // real (no forma parte de la matriz previa, se chequea aparte).
  const ventanaHorario = ventanaHorarioDe(porAgente[agenteId]);
  const fueraDeVentanaHorario =
    !!ventanaHorario && !dentroDeVentanaCircular(columnaDestino, ventanaHorario.horaInicio, ventanaHorario.horaFin);

  // A: ¿el agente que arrastro ya está en otra casilla/vista a esta hora?
  const conflictoEntrante = buscarConflicto(
    matrices, pasoActual, columnaDestino, agenteId,
    vistaExcluida, filaExcluida,
    esOrigenMatriz ? origen.columna : null
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

  // Matriz simulada con la celda de ORIGEN ya vaciada, para que el
  // cálculo de horas consecutivas del entrante no cuente una racha que
  // en la práctica se corta porque esa celda se libera en la misma
  // operación (ej.: agente en casillas 10 y 12, lo muevo a la 11 —
  // sin esto, contaba 10-11-12 como si las tres quedaran ocupadas).
  let matrizSimulada = matrizActual;
  if (esOrigenMatriz) {
    matrizSimulada = matrizActual.map((row) => [...row]);
    if (matrizSimulada[origen.fila]) matrizSimulada[origen.fila][origen.columna] = null;
  }

  let conflictoDesplazado = null;
  let horasConsecutivasDesplazado = false;
  if (esIntercambio) {
    // ¿El desplazado ya está en otro lado a la hora de origen (adonde
    // iría a parar tras el intercambio)?
    conflictoDesplazado = buscarConflicto(
      matrices, pasoActual, origen.columna, ocupanteEnCelda,
      vistaActual.id, filaDestino,
      columnaDestino
    );
    if (!conflictoDesplazado) {
      // Acá sí corresponde mirar la matriz real (sin simular), porque
      // la celda que se libera es la de DESTINO (filaDestino/columnaDestino,
      // ocupada por el desplazado), no la de origen del agente entrante.
      const matrizSinDestino = matrizActual.map((row) => [...row]);
      if (matrizSinDestino[filaDestino]) matrizSinDestino[filaDestino][columnaDestino] = null;
      horasConsecutivasDesplazado = verificarHorasConsecutivas(matrizSinDestino, origen.columna, ocupanteEnCelda);
    }
  }

  const horasConsecutivasEntrante =
    !conflictoEntrante && verificarHorasConsecutivas(matrizSimulada, columnaDestino, agenteId);

  return {
    agenteId,
    ocupanteId: hayOcupante ? ocupanteEnCelda : null,
    ocupanteEsPrestamo,
    esIntercambio,
    fueraDeVentanaHorario,
    ventanaHorario,
    conflictoEntrante,
    conflictoDesplazado,
    horasConsecutivasEntrante,
    horasConsecutivasDesplazado,
  };
}

// Traduce el diagnóstico a qué modal corresponde mostrar, respetando
// prioridad: ventana de refuerzo (bloqueo absoluto) > conflicto de
// entrante > bloqueo de intercambio > préstamo > reemplazo/intercambio
// simple > horas consecutivas > nada.
export function resolverTipoModal(diagnostico) {
  const { fueraDeVentanaHorario, conflictoEntrante, esIntercambio, conflictoDesplazado, ocupanteEsPrestamo, ocupanteId } = diagnostico;

  if (fueraDeVentanaHorario) return 'fueraDeVentanaHorario';
  if (conflictoEntrante) return 'conflictoEntrante';
  if (esIntercambio && conflictoDesplazado) return 'bloqueoIntercambio';
  if (ocupanteEsPrestamo) return 'avisoPrestamo';
  if (ocupanteId && esIntercambio) return 'confirmarIntercambio';
  if (ocupanteId && !esIntercambio) return 'confirmarReemplazo';
  if (diagnostico.horasConsecutivasEntrante) return 'confirmarHorasConsecutivas';
  return null;
}

// Calcula las matrices nuevas para el tipo de resolución elegido.
// No aplica 'bloqueoIntercambio', 'fueraDeVentanaHorario' ni
// cancelaciones: esos casos se resuelven en el componente simplemente
// cerrando el modal, sin tocar nada.
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
        const vistaConflicto = pasoActual.vistas.find((v) => v.id === conflicto.vistaId);
        const filasNecesariasConflicto = vistaConflicto.casillas.length;
        const guardadaConflicto = nuevasMatrices[keyConflicto];
        const matrizConflicto = guardadaConflicto
          ? (guardadaConflicto.length >= filasNecesariasConflicto
              ? guardadaConflicto.map((row) => [...row])
              : [...guardadaConflicto.map((row) => [...row]), ...crearMatrizVacia(filasNecesariasConflicto - guardadaConflicto.length)])
          : crearMatrizVacia(filasNecesariasConflicto);
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
