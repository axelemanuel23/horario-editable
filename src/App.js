import React, { useState, useEffect, useMemo, useRef } from 'react';
import { BrowserRouter as Router, Route, Routes, Link } from 'react-router-dom';
import { ArrowUpDown, BarChart2, Info, Settings, Users, LogOut } from 'lucide-react';
import EstadisticasCasillas from './EstadisticasCasillas';
import PasoManager from './PasoManager';
import AgentesManager from './AgentesManager';

const colors = [
  'bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500',
  'bg-pink-500', 'bg-indigo-500', 'bg-teal-500', 'bg-orange-500', 'bg-cyan-500'
];

const HORAS_DIA = 24;

function crearMatrizVacia(filas) {
  return Array(filas).fill().map(() => Array(HORAS_DIA).fill(null));
}

function matrizKey(pasoId, vistaId) {
  return `${pasoId}:${vistaId}`;
}

function construirHorasTurno(horaInicio, horaFin) {
  const horas = [];
  let h = horaInicio;
  for (let i = 0; i < HORAS_DIA; i++) {
    horas.push(h);
    h = (h + 1) % HORAS_DIA;
    if (h === horaFin) break;
  }
  return horas;
}

function etiquetaHora(h) {
  return `${String(h).padStart(2, '0')}:00`;
}

function operativoVacio() {
  return { activosHoyIds: [], porAgente: {}, movimientos: [] };
}

function registroOperativoVacio() {
  return { equipo: null, vistaPrincipal: null, turnoPrincipal: null, ausente: false, retiradoHora: null };
}

const HorarioEditable = () => {
  const [pasos, setPasos] = useState(() => {
    const saved = localStorage.getItem('pasos_v1');
    return saved ? JSON.parse(saved) : [];
  });

  const recargarPasos = () => {
    const saved = localStorage.getItem('pasos_v1');
    setPasos(saved ? JSON.parse(saved) : []);
  };

  const [agentesIdentidad] = useState(() => {
    const saved = localStorage.getItem('agentes_identidad_v1');
    return saved ? JSON.parse(saved) : [];
  });

  const [selectedPasoId, setSelectedPasoId] = useState(() => localStorage.getItem('selectedPasoId_v1') || null);
  const pasoActual = pasos.find((p) => p.id === selectedPasoId) || pasos[0] || null;

  useEffect(() => {
    if (pasoActual) localStorage.setItem('selectedPasoId_v1', pasoActual.id);
  }, [pasoActual]);

  const [selectedVistaId, setSelectedVistaId] = useState(null);
  const [selectedTurnoId, setSelectedTurnoId] = useState(null);

  useEffect(() => {
    if (!pasoActual) return;
    setSelectedVistaId((actual) =>
      pasoActual.vistas.some((v) => v.id === actual) ? actual : pasoActual.vistas[0]?.id ?? null
    );
    setSelectedTurnoId((actual) =>
      pasoActual.turnos.some((t) => t.id === actual) ? actual : pasoActual.turnos[0]?.id ?? null
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pasoActual?.id]);

  const vistaActual = pasoActual?.vistas.find((v) => v.id === selectedVistaId) || null;
  const turnoActual = pasoActual?.turnos.find((t) => t.id === selectedTurnoId) || null;

  const [matrices, setMatrices] = useState(() => {
    const saved = localStorage.getItem('matrices_v3');
    return saved ? JSON.parse(saved) : {};
  });

  const [estadoOperativo, setEstadoOperativo] = useState(() => {
    const saved = localStorage.getItem('estadoOperativo_v1');
    return saved ? JSON.parse(saved) : {};
  });

  const operativoPaso = (pasoActual && estadoOperativo[pasoActual.id]) || operativoVacio();

  const actualizarOperativoPaso = (nuevoSlice) => {
    setEstadoOperativo({ ...estadoOperativo, [pasoActual.id]: nuevoSlice });
  };

  const [lastProcessedHour, setLastProcessedHour] = useState(() => {
    const saved = localStorage.getItem('lastProcessedHour_v3');
    return saved !== null ? Number(saved) : null;
  });

  const [tick, setTick] = useState(0);
  const [confirmationModal, setConfirmationModal] = useState({ show: false, action: null });
  const [conflictoModal, setConflictoModal] = useState({ show: false });
  const [otrasVistasAbiertas, setOtrasVistasAbiertas] = useState(new Set());
  const [selectedHorarioCasilla, setSelectedHorarioCasilla] = useState(null);
  const [horarioTexto, setHorarioTexto] = useState('');
  const [ordenamiento, setOrdenamiento] = useState('alfabetico');
  const [infoCelda, setInfoCelda] = useState(null);

  const [guardiaElegida, setGuardiaElegida] = useState('');
  const [mostrarRefuerzo, setMostrarRefuerzo] = useState(false);
  const [filtroRefuerzo, setFiltroRefuerzo] = useState('');
  const [mostrarCambio, setMostrarCambio] = useState(false);
  const [cambioEntraId, setCambioEntraId] = useState('');
  const [cambioSaleId, setCambioSaleId] = useState('');

  const [snapshotConsulta, setSnapshotConsulta] = useState(null);
  const [modoEdicionConsulta, setModoEdicionConsulta] = useState(false);
  const [vistaConsultaIdx, setVistaConsultaIdx] = useState(0);

  const matricesRef = useRef(matrices);
  matricesRef.current = matrices;
  const operativoRef = useRef(estadoOperativo);
  operativoRef.current = estadoOperativo;

  useEffect(() => {
    localStorage.setItem('matrices_v3', JSON.stringify(matrices));
  }, [matrices]);

  useEffect(() => {
    localStorage.setItem('estadoOperativo_v1', JSON.stringify(estadoOperativo));
  }, [estadoOperativo]);

  useEffect(() => {
    if (lastProcessedHour !== null) {
      localStorage.setItem('lastProcessedHour_v3', String(lastProcessedHour));
    }
  }, [lastProcessedHour]);

  // =========================================================
  // INTERCAMBIO DE EQUIPO AL HABER RELEVO EN CASILLA
  //
  // Igual que antes: usa la hora ABSOLUTA real del reloj, no la
  // posición dentro del turno seleccionado en pantalla.
  // =========================================================

  function procesarTransicionHoraria(columnaAnterior, columnaNueva) {
    if (!pasoActual) return;
    const operativoActual = operativoRef.current[pasoActual.id] || operativoVacio();
    const porAgente = { ...operativoActual.porAgente };
    const mapaEquipos = new Map(Object.entries(porAgente).map(([id, r]) => [id, r.equipo]));

    pasoActual.vistas.forEach((vista) => {
      const matriz = matricesRef.current[matrizKey(pasoActual.id, vista.id)];
      if (!matriz) return;
      for (const fila of matriz) {
        const anterior = fila[columnaAnterior];
        const nueva = fila[columnaNueva];
        if (anterior && nueva && anterior !== nueva) {
          mapaEquipos.set(anterior, mapaEquipos.get(nueva));
        }
      }
    });

    Object.keys(porAgente).forEach((id) => {
      porAgente[id] = { ...porAgente[id], equipo: mapaEquipos.get(id) ?? porAgente[id].equipo };
    });

    actualizarOperativoPaso({ ...operativoActual, porAgente });
  }

  useEffect(() => {
    if (!pasoActual) return;
    const revisarHora = () => {
      setTick((t) => t + 1);
      const horaActual = new Date().getHours();

      setLastProcessedHour((prevHora) => {
        if (prevHora === null) return horaActual;
        if (prevHora === horaActual) return prevHora;

        let h = prevHora;
        let pasosCount = 0;
        while (h !== horaActual && pasosCount < HORAS_DIA) {
          const siguiente = (h + 1) % HORAS_DIA;
          procesarTransicionHoraria(h, siguiente);
          h = siguiente;
          pasosCount++;
        }
        return horaActual;
      });
    };

    revisarHora();
    const interval = setInterval(revisarHora, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pasoActual?.id]);

  // =========================================================
  // HELPERS
  // =========================================================

  const identidadPorId = (id) => agentesIdentidad.find((a) => a.id === id);
  const nombreCompleto = (identidad) => (identidad ? `${identidad.nombre} ${identidad.apellido}` : '?');

  const matrizActual = useMemo(() => {
    if (!pasoActual || !vistaActual) return [];
    const filasNecesarias = vistaActual.casillas.length;
    const guardada = matrices[matrizKey(pasoActual.id, vistaActual.id)];
    if (!guardada) return crearMatrizVacia(filasNecesarias);
    // Si la plantilla sumó casillas después de que ya hubiera datos
    // guardados, la matriz vieja queda corta — se completa con filas
    // vacías en vez de romper al intentar escribir en una fila que no
    // existía todavía.
    if (guardada.length >= filasNecesarias) return guardada;
    return [...guardada, ...crearMatrizVacia(filasNecesarias - guardada.length)];
  }, [matrices, pasoActual, vistaActual]);

  const setMatrizActual = (nuevaMatriz) => {
    setMatrices({ ...matrices, [matrizKey(pasoActual.id, vistaActual.id)]: nuevaMatriz });
  };

  const horasTurno = useMemo(
    () => (turnoActual ? construirHorasTurno(turnoActual.horaInicio, turnoActual.horaFin) : []),
    [turnoActual]
  );

  const columnaEnVivoPantalla = useMemo(() => {
    const horaActual = new Date().getHours();
    const idx = horasTurno.indexOf(horaActual);
    return idx === -1 ? null : idx;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horasTurno, tick]);

  const horaAbsolutaActual = new Date().getHours();

  // Una hora cuenta como "a futuro" (se puede liberar/reasignar en un
  // retiro o cambio) si su posición dentro del turno actual es igual o
  // posterior a la posición de la hora en vivo. Si no se puede ubicar
  // (celda de un turno distinto al que tenés en pantalla), se trata
  // como futura por las dudas, para no dejar datos huérfanos.
  const esHoraFutura = (h) => {
    const posH = horasTurno.indexOf(h);
    const posActual = horasTurno.indexOf(horaAbsolutaActual);
    if (posH === -1 || posActual === -1) return true;
    return posH >= posActual;
  };

  const CAPITALIZAR = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  const infoAjeno = (registro) => {
    if (!pasoActual || !registro) return null;
    const vistaAgente = pasoActual.vistas.find((v) => v.id === registro.vistaPrincipal);
    const turnoAgente = pasoActual.turnos.find((t) => t.id === registro.turnoPrincipal);

    const ajenoVista = pasoActual.vistas.length > 1 && registro.vistaPrincipal !== selectedVistaId;
    const ajenoTurno = registro.turnoPrincipal !== selectedTurnoId;
    if (!ajenoVista && !ajenoTurno) return null;

    const partes = [];
    if (ajenoVista && vistaAgente) partes.push(vistaAgente.nombre);
    if (ajenoTurno && turnoAgente) partes.push(`turno ${CAPITALIZAR(turnoAgente.nombre)}`);
    return partes.length ? `Agente de ${partes.join(' — ')}` : null;
  };

  const idsEnCasillaAhora = useMemo(() => {
    if (!pasoActual) return new Set();
    const ids = new Set();
    pasoActual.vistas.forEach((vista) => {
      const matriz = matrices[matrizKey(pasoActual.id, vista.id)];
      if (!matriz) return;
      matriz.forEach((fila) => {
        if (fila[horaAbsolutaActual]) ids.add(fila[horaAbsolutaActual]);
      });
    });
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrices, pasoActual, tick]);

  const horasPorAgente = useMemo(() => {
    if (!pasoActual) return new Map();
    const conteo = new Map();
    pasoActual.vistas.forEach((vista) => {
      const matriz = matrices[matrizKey(pasoActual.id, vista.id)];
      if (!matriz) return;
      matriz.forEach((fila) => {
        fila.forEach((id) => {
          if (id) conteo.set(id, (conteo.get(id) || 0) + 1);
        });
      });
    });
    return conteo;
  }, [matrices, pasoActual]);

  // =========================================================
  // CARGA DE GUARDIA / INICIO DE JORNADA
  // =========================================================

  const cargarGuardia = () => {
    if (!pasoActual) return;
    const guardias = pasoActual.guardias || [];
    const candidatos = agentesIdentidad.filter(
      (a) => a.paso === pasoActual.id && (guardias.length === 0 || a.guardia === guardiaElegida)
    );
    const porAgente = {};
    candidatos.forEach((a) => {
      porAgente[a.id] = registroOperativoVacio();
    });
    actualizarOperativoPaso({ activosHoyIds: candidatos.map((a) => a.id), porAgente, movimientos: [] });
  };

  // =========================================================
  // REFUERZO / CAMBIO POR PLANILLA / RETIRAR
  // =========================================================

  const poolDisponibleParaSumar = (filtro) => {
    if (!pasoActual) return [];
    const texto = filtro.trim().toLowerCase();
    return agentesIdentidad.filter(
      (a) =>
        a.paso === pasoActual.id &&
        !operativoPaso.activosHoyIds.includes(a.id) &&
        (!texto || `${a.nombre} ${a.apellido}`.toLowerCase().includes(texto))
    );
  };

  const confirmarRefuerzo = (agenteId) => {
    const nuevoPorAgente = { ...operativoPaso.porAgente, [agenteId]: registroOperativoVacio() };
    const movimientos = [
      ...operativoPaso.movimientos,
      { tipo: 'refuerzo', agenteId, hora: horaAbsolutaActual },
    ];
    actualizarOperativoPaso({
      activosHoyIds: [...operativoPaso.activosHoyIds, agenteId],
      porAgente: nuevoPorAgente,
      movimientos,
    });
    setMostrarRefuerzo(false);
    setFiltroRefuerzo('');
  };

  const confirmarCambio = () => {
    if (!cambioEntraId || !cambioSaleId) return;
    const registroSale = operativoPaso.porAgente[cambioSaleId] || registroOperativoVacio();

    const nuevoPorAgente = {
      ...operativoPaso.porAgente,
      [cambioSaleId]: { ...registroSale, ausente: true },
      [cambioEntraId]: { ...registroSale, ausente: false, retiradoHora: null },
    };

    const nuevasMatrices = { ...matrices };
    pasoActual.vistas.forEach((vista) => {
      const key = matrizKey(pasoActual.id, vista.id);
      const matriz = nuevasMatrices[key];
      if (!matriz) return;
      nuevasMatrices[key] = matriz.map((fila) =>
        fila.map((celda, h) => (celda === cambioSaleId && esHoraFutura(h) ? cambioEntraId : celda))
      );
    });
    setMatrices(nuevasMatrices);

    const movimientos = [
      ...operativoPaso.movimientos,
      { tipo: 'cambio', entra: cambioEntraId, sale: cambioSaleId, hora: horaAbsolutaActual },
    ];
    actualizarOperativoPaso({
      activosHoyIds: [...operativoPaso.activosHoyIds, cambioEntraId],
      porAgente: nuevoPorAgente,
      movimientos,
    });

    setMostrarCambio(false);
    setCambioEntraId('');
    setCambioSaleId('');
  };

  const retirarAgente = (agenteId) => {
    if (!window.confirm('¿Confirmar que este agente se retira de la guardia ahora?')) return;

    const nuevasMatrices = { ...matrices };
    pasoActual.vistas.forEach((vista) => {
      const key = matrizKey(pasoActual.id, vista.id);
      const matriz = nuevasMatrices[key];
      if (!matriz) return;
      nuevasMatrices[key] = matriz.map((fila) =>
        fila.map((celda, h) => (celda === agenteId && esHoraFutura(h) ? null : celda))
      );
    });
    setMatrices(nuevasMatrices);

    const registro = operativoPaso.porAgente[agenteId] || registroOperativoVacio();
    const movimientos = [...operativoPaso.movimientos, { tipo: 'retiro', agenteId, hora: horaAbsolutaActual }];
    actualizarOperativoPaso({
      ...operativoPaso,
      porAgente: { ...operativoPaso.porAgente, [agenteId]: { ...registro, retiradoHora: horaAbsolutaActual } },
      movimientos,
    });
  };

  // =========================================================
  // CIERRE DE JORNADA
  // =========================================================

  // =========================================================
  // LIMPIEZA (sin generar archivo de cierre)
  //
  // Tres alcances separados, para elegir según la situación:
  //   - solo la grilla (nadie pierde su turno/equipo asignado)
  //   - solo las asignaciones (todos vuelven a "pendientes", la grilla
  //     de casillas queda igual)
  //   - todo (equivalente a Cerrar Jornada pero sin descargar archivo,
  //     para cuando la jornada arrancó mal y no corresponde generar
  //     un registro de un día que no pasó)
  // =========================================================

  const limpiarMatriz = () => {
    if (!window.confirm('¿Vaciar toda la grilla de casillas de este paso? No borra agentes ni sus asignaciones de turno/equipo.')) return;
    const nuevasMatrices = { ...matrices };
    pasoActual.vistas.forEach((v) => delete nuevasMatrices[matrizKey(pasoActual.id, v.id)]);
    setMatrices(nuevasMatrices);
  };

  const reiniciarAsignaciones = () => {
    if (!window.confirm('¿Devolver a todos los agentes activos a "Pendientes de asignar"? La grilla de casillas no se toca.')) return;
    const porAgente = {};
    operativoPaso.activosHoyIds.forEach((id) => {
      porAgente[id] = registroOperativoVacio();
    });
    actualizarOperativoPaso({ ...operativoPaso, porAgente });
  };

  const reiniciarTodoSinArchivo = () => {
    if (!window.confirm('¿Reiniciar la jornada completa SIN generar archivo de cierre? Se pierde todo lo cargado hasta ahora.')) return;
    const nuevasMatrices = { ...matrices };
    pasoActual.vistas.forEach((v) => delete nuevasMatrices[matrizKey(pasoActual.id, v.id)]);
    setMatrices(nuevasMatrices);
    actualizarOperativoPaso(operativoVacio());
    setLastProcessedHour(null);
    localStorage.removeItem('lastProcessedHour_v3');
  };

  const cerrarJornada = () => {
    if (!pasoActual) return;
    if (!window.confirm('¿Cerrar la jornada? Se descarga el archivo del día y se resetea todo lo operativo para arrancar de cero.')) return;

    const snapshot = {
      pasoId: pasoActual.id,
      pasoNombre: pasoActual.nombre,
      fecha: new Date().toISOString(),
      vistas: pasoActual.vistas.map((v) => ({
        nombre: v.nombre,
        casillas: v.casillas.map((c) => c.nombre),
        matriz: matrices[matrizKey(pasoActual.id, v.id)] || crearMatrizVacia(v.casillas.length),
      })),
      turnos: pasoActual.turnos,
      agentes: operativoPaso.activosHoyIds.map((id) => {
        const identidad = identidadPorId(id);
        const registro = operativoPaso.porAgente[id] || registroOperativoVacio();
        const vistaNombre = pasoActual.vistas.find((v) => v.id === registro.vistaPrincipal)?.nombre || null;
        const turnoNombre = pasoActual.turnos.find((t) => t.id === registro.turnoPrincipal)?.nombre || null;
        return {
          id,
          nombre: identidad?.nombre || '?',
          apellido: identidad?.apellido || '',
          guardia: identidad?.guardia || '',
          equipo: registro.equipo,
          vistaPrincipal: vistaNombre,
          turnoPrincipal: turnoNombre,
          ausente: registro.ausente,
          retiradoHora: registro.retiradoHora,
          horasTrabajadas: horasPorAgente.get(id) || 0,
        };
      }),
      movimientos: operativoPaso.movimientos.map((m) => ({
        ...m,
        agenteNombre: m.agenteId ? nombreCompleto(identidadPorId(m.agenteId)) : undefined,
        entraNombre: m.entra ? nombreCompleto(identidadPorId(m.entra)) : undefined,
        saleNombre: m.sale ? nombreCompleto(identidadPorId(m.sale)) : undefined,
      })),
    };

    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const fecha = new Date();
    fecha.setHours(fecha.getHours() - 3);
    const fechaActual = fecha.toISOString().slice(0, 19).replace(/:/g, '-');
    link.setAttribute('download', `cierre_${pasoActual.nombre}_${fechaActual}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    const nuevasMatrices = { ...matrices };
    pasoActual.vistas.forEach((v) => delete nuevasMatrices[matrizKey(pasoActual.id, v.id)]);
    setMatrices(nuevasMatrices);
    actualizarOperativoPaso(operativoVacio());
    setLastProcessedHour(null);
    localStorage.removeItem('lastProcessedHour_v3');
  };

  const importarCierre = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        setSnapshotConsulta(data);
        setModoEdicionConsulta(false);
        setVistaConsultaIdx(0);
      } catch (err) {
        alert('No se pudo leer el archivo. ¿Es un cierre de jornada válido (.json)?');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const limpiarCeldaConsulta = (vistaIdx, filaIdx, columna) => {
    if (!modoEdicionConsulta) return;
    setSnapshotConsulta((prev) => {
      const copia = JSON.parse(JSON.stringify(prev));
      copia.vistas[vistaIdx].matriz[filaIdx][columna] = null;
      return copia;
    });
  };

  const descargarConsultaCorregida = () => {
    const blob = new Blob([JSON.stringify(snapshotConsulta, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `cierre_corregido_${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // =========================================================
  // ASIGNACIÓN (DRAG & DROP EN LA GRILLA)
  // =========================================================

  const agenteYaEnColumna = (columnaAbsoluta, agenteId, vistaExcluida, filaExcluida) => {
    if (!pasoActual) return false;
    return pasoActual.vistas.some((vista) => {
      const matriz = matrices[matrizKey(pasoActual.id, vista.id)];
      if (!matriz) return false;
      return matriz.some(
        (row, idx) => !(vista.id === vistaExcluida && idx === filaExcluida) && row[columnaAbsoluta] === agenteId
      );
    });
  };

  // Ubica EXACTAMENTE dónde (qué vista, qué fila) está ya asignado un
  // agente en una hora dada, para poder ofrecer "reasignar" en vez de
  // solo bloquear — necesario para el préstamo entre sectores.
  const buscarConflicto = (columnaAbsoluta, agenteId, vistaExcluida, filaExcluida) => {
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
  };

  const verificarHorasConsecutivas = (matriz, columnaAbsoluta, agenteId) => {
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
  };

  const manejarDragStart = (e, agenteId, fila, columna) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ agenteId, fila, columna }));
  };

  const manejarDragOver = (e) => e.preventDefault();

  const manejarDrop = (e, fila, columnaPantalla) => {
    e.preventDefault();
    const { agenteId, fila: filaOrigen, columna: columnaOrigenPantalla } = JSON.parse(e.dataTransfer.getData('text'));
    const columna = horasTurno[columnaPantalla];
    const nuevaMatriz = matrizActual.map((row) => [...row]);

    if (filaOrigen !== undefined && columnaOrigenPantalla !== undefined) {
      const columnaOrigen = horasTurno[columnaOrigenPantalla];
      if (columna === columnaOrigen) {
        nuevaMatriz[filaOrigen][columnaOrigen] = null;
        nuevaMatriz[fila][columna] = agenteId;
        setMatrizActual(nuevaMatriz);
      } else if (!nuevaMatriz[fila][columna]) {
        if (agenteYaEnColumna(columna, agenteId, vistaActual.id, filaOrigen)) {
          alert('Ese agente ya está asignado en este horario.');
          return;
        }
        const aplicar = () => {
          nuevaMatriz[filaOrigen][columnaOrigen] = null;
          nuevaMatriz[fila][columna] = agenteId;
          setMatrizActual(nuevaMatriz);
        };
        if (verificarHorasConsecutivas(nuevaMatriz, columna, agenteId)) {
          setConfirmationModal({ show: true, action: aplicar });
        } else {
          aplicar();
        }
      } else {
        alert('Esa posición ya está ocupada por otro agente.');
      }
    } else {
      if (nuevaMatriz[fila][columna]) {
        alert('Esa posición ya está ocupada.');
        return;
      }
      const conflicto = buscarConflicto(columna, agenteId, null, null);
      if (conflicto) {
        setConflictoModal({ show: true, agenteId, filaDestino: fila, columnaDestino: columna, conflicto });
        return;
      }
      const aplicar = () => {
        nuevaMatriz[fila][columna] = agenteId;
        setMatrizActual(nuevaMatriz);
      };
      if (verificarHorasConsecutivas(nuevaMatriz, columna, agenteId)) {
        setConfirmationModal({ show: true, action: aplicar });
      } else {
        aplicar();
      }
    }
  };

  const manejarClickFicha = (fila, columnaPantalla) => {
    const columna = horasTurno[columnaPantalla];
    const nuevaMatriz = matrizActual.map((row) => [...row]);
    if (nuevaMatriz[fila][columna] !== null) {
      nuevaMatriz[fila][columna] = null;
      setMatrizActual(nuevaMatriz);
    }
  };

  const extenderCasilla = (agenteId) => {
    if (!pasoActual) return;
    let vistaEncontrada = null;
    let matrizEncontrada = null;
    let filaEncontrada = -1;

    for (const vista of pasoActual.vistas) {
      const matriz = matrices[matrizKey(pasoActual.id, vista.id)];
      if (!matriz) continue;
      const fila = matriz.findIndex((row) => row[horaAbsolutaActual] === agenteId);
      if (fila !== -1) {
        vistaEncontrada = vista;
        matrizEncontrada = matriz;
        filaEncontrada = fila;
        break;
      }
    }
    if (!vistaEncontrada) return;

    let siguiente = horaAbsolutaActual;
    let pasosCount = 0;
    while (matrizEncontrada[filaEncontrada][siguiente] === agenteId && pasosCount < HORAS_DIA) {
      siguiente = (siguiente + 1) % HORAS_DIA;
      pasosCount++;
    }

    if (matrizEncontrada[filaEncontrada][siguiente] !== null || agenteYaEnColumna(siguiente, agenteId, null, null)) {
      alert('La hora siguiente ya está ocupada.');
      return;
    }

    const aplicar = () => {
      const nuevaMatriz = matrizEncontrada.map((row) => [...row]);
      nuevaMatriz[filaEncontrada][siguiente] = agenteId;
      setMatrices({ ...matrices, [matrizKey(pasoActual.id, vistaEncontrada.id)]: nuevaMatriz });
    };

    if (verificarHorasConsecutivas(matrizEncontrada, siguiente, agenteId)) {
      setConfirmationModal({ show: true, action: aplicar });
    } else {
      aplicar();
    }
  };

  // =========================================================
  // PRÉSTAMO ENTRE VISTAS (conflicto de doble asignación)
  // =========================================================

  const resolverConflictoCancelar = () => setConflictoModal({ show: false });

  const resolverConflictoReasignar = () => {
    const { agenteId, filaDestino, columnaDestino, conflicto } = conflictoModal;

    const aplicar = () => {
      const nuevasMatrices = { ...matrices };
      const keyOrigen = matrizKey(pasoActual.id, conflicto.vistaId);
      const matrizOrigen = (nuevasMatrices[keyOrigen] || []).map((row) => [...row]);
      if (matrizOrigen[conflicto.filaIdx]) matrizOrigen[conflicto.filaIdx][columnaDestino] = null;
      nuevasMatrices[keyOrigen] = matrizOrigen;

      const keyDestino = matrizKey(pasoActual.id, vistaActual.id);
      const matrizDestino = matrizActual.map((row) => [...row]);
      matrizDestino[filaDestino][columnaDestino] = agenteId;
      nuevasMatrices[keyDestino] = matrizDestino;

      setMatrices(nuevasMatrices);
    };

    setConflictoModal({ show: false });

    if (verificarHorasConsecutivas(matrizActual, columnaDestino, agenteId)) {
      setConfirmationModal({ show: true, action: aplicar });
    } else {
      aplicar();
    }
  };

  const toggleOtrasVistas = (equipo) => {
    const copia = new Set(otrasVistasAbiertas);
    if (copia.has(equipo)) copia.delete(equipo);
    else copia.add(equipo);
    setOtrasVistasAbiertas(copia);
  };

  // Agentes de OTRAS vistas (mismo equipo, mismo turno, libres ahora)
  // disponibles para prestar a la vista actual. No les cambia la
  // vistaPrincipal real — el ícono ⓘ los sigue marcando como ajenos
  // una vez asignados, tal cual corresponde.
  const agentesOtraVista = (equipo) => {
    if (!pasoActual || pasoActual.vistas.length <= 1) return [];
    // No se filtra por "libre ahora mismo": podés necesitar a alguien
    // que en este momento está en casilla pero va a estar libre dentro
    // de un rato. El chequeo de choque horario real ya lo hace
    // buscarConflicto en el momento de soltarlo sobre una celda
    // puntual — acá alcanza con mostrar a todos los candidatos.
    return activosPresentes.filter(
      (x) =>
        x.registro.equipo === equipo &&
        x.registro.turnoPrincipal === selectedTurnoId &&
        x.registro.vistaPrincipal &&
        x.registro.vistaPrincipal !== selectedVistaId
    );
  };


  // =========================================================
  // LISTAS DERIVADAS
  // =========================================================

  const activosInfo = operativoPaso.activosHoyIds
    .map((id) => ({ id, identidad: identidadPorId(id), registro: operativoPaso.porAgente[id] || registroOperativoVacio() }))
    .filter((x) => x.identidad);

  const activosPresentes = activosInfo.filter((x) => !x.registro.ausente && !x.registro.retiradoHora);

  const pendientes = activosPresentes.filter(
    (x) =>
      !x.registro.turnoPrincipal ||
      !x.registro.equipo ||
      (pasoActual && pasoActual.vistas.length > 1 && !x.registro.vistaPrincipal)
  );

  const sinTurno = activosPresentes.filter((x) => !x.registro.turnoPrincipal).length;
  const sinEquipo = activosPresentes.filter((x) => x.registro.turnoPrincipal && !x.registro.equipo).length;
  const sinVista =
    pasoActual && pasoActual.vistas.length > 1
      ? activosPresentes.filter((x) => x.registro.equipo && !x.registro.vistaPrincipal).length
      : 0;

  const asignarCampoAgente = (agenteId, campo, valor) => {
    const registro = operativoPaso.porAgente[agenteId] || registroOperativoVacio();
    actualizarOperativoPaso({
      ...operativoPaso,
      porAgente: { ...operativoPaso.porAgente, [agenteId]: { ...registro, [campo]: valor } },
    });
  };

  const ordenarAgentesPorEquipo = () => {
    if (!pasoActual) return [];
    let listado = activosPresentes.filter(
      (x) =>
        !idsEnCasillaAhora.has(x.id) &&
        x.registro.turnoPrincipal &&
        x.registro.equipo &&
        (pasoActual.vistas.length <= 1 || x.registro.vistaPrincipal) &&
        (pasoActual.vistas.length <= 1 || x.registro.vistaPrincipal === selectedVistaId) &&
        x.registro.turnoPrincipal === selectedTurnoId
    );

    if (ordenamiento === 'alfabetico') {
      listado = [...listado].sort((a, b) =>
        `${a.identidad.apellido} ${a.identidad.nombre}`
          .toLowerCase()
          .localeCompare(`${b.identidad.apellido} ${b.identidad.nombre}`.toLowerCase())
      );
    } else {
      listado = [...listado].sort((a, b) => (horasPorAgente.get(b.id) || 0) - (horasPorAgente.get(a.id) || 0));
    }

    return pasoActual.equipos.map((equipo) => ({
      equipo,
      agentes: listado.filter((x) => x.registro.equipo === equipo),
    }));
  };

  const agentesEnCasillaAhora = activosInfo.filter((x) => idsEnCasillaAhora.has(x.id));

  const colorPara = (id) => colors[Math.abs(hashCode(id)) % colors.length];
  function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = (hash << 5) - hash + str.charCodeAt(i);
    return hash;
  }

  const generarTextoHorario = () => {
    if (selectedHorarioCasilla === null || !pasoActual) return;
    let texto = '';
    if (selectedHorarioCasilla === -1) {
      texto += `-- Equipos --\n`;
      ordenarAgentesPorEquipo().forEach(({ equipo, agentes: lista }) => {
        texto += `${equipo}:\n`;
        lista.forEach((x) => {
          texto += ` - ${x.identidad.nombre} ${x.identidad.apellido}\n`;
        });
      });
      texto += `Casilla:\n`;
      agentesEnCasillaAhora.forEach((x) => {
        texto += ` - ${x.identidad.nombre} ${x.identidad.apellido}\n`;
      });
    } else {
      const horaAbs = horasTurno[selectedHorarioCasilla];
      texto += `Horario: ${etiquetaHora(horaAbs)}\n`;
      matrizActual.forEach((fila, indexFila) => {
        if (fila[horaAbs]) {
          const identidad = identidadPorId(fila[horaAbs]);
          texto += `${vistaActual.casillas[indexFila]?.nombre}: ${nombreCompleto(identidad)}\n`;
        }
      });
    }
    setHorarioTexto(texto.trim());
  };

  // =========================================================
  // RENDER
  // =========================================================

  if (pasos.length === 0) {
    return (
      <div className="p-4 bg-gray-100 min-h-screen">
        <h1 className="text-2xl font-bold mb-4">Gestión de horarios</h1>
        <p className="mb-4">Todavía no hay ninguna plantilla de paso creada.</p>
        <div className="flex items-center gap-2">
          <Link to="/plantillas" className="bg-blue-500 text-white p-2 rounded inline-flex items-center">
            <Settings size={18} className="mr-2" /> Crear la primera plantilla
          </Link>
          <Link to="/estadisticas" className="bg-purple-500 text-white p-2 rounded inline-flex items-center">
            <BarChart2 size={18} className="mr-2" /> Ver Estadísticas
          </Link>
        </div>
      </div>
    );
  }

  if (!pasoActual || !vistaActual || !turnoActual) {
    return <div className="p-4">Cargando…</div>;
  }

  // ---- MODO CONSULTA (cierre importado) ----
  if (snapshotConsulta) {
    const vistaSnap = snapshotConsulta.vistas[vistaConsultaIdx];
    const agentePorIdSnap = (id) => snapshotConsulta.agentes.find((a) => a.id === id);
    return (
      <div className="p-4 bg-gray-100 min-h-screen">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">
            Consulta: {snapshotConsulta.pasoNombre} — {new Date(snapshotConsulta.fecha).toLocaleString()}
          </h1>
          <button
            onClick={() => setSnapshotConsulta(null)}
            className="bg-gray-300 p-2 rounded"
          >
            Volver a jornada en vivo
          </button>
        </div>

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {snapshotConsulta.vistas.length > 1 && (
            <select value={vistaConsultaIdx} onChange={(e) => setVistaConsultaIdx(Number(e.target.value))} className="border p-2">
              {snapshotConsulta.vistas.map((v, idx) => (
                <option key={idx} value={idx}>{v.nombre || `Vista ${idx + 1}`}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => setModoEdicionConsulta(!modoEdicionConsulta)}
            className={`p-2 rounded ${modoEdicionConsulta ? 'bg-yellow-500 text-white' : 'bg-gray-300'}`}
          >
            {modoEdicionConsulta ? 'Bloquear edición' : 'Habilitar edición'}
          </button>
          {modoEdicionConsulta && (
            <button onClick={descargarConsultaCorregida} className="bg-green-500 text-white p-2 rounded">
              Descargar corregido
            </button>
          )}
        </div>

        <div className="bg-white p-4 rounded shadow mb-4">
          <h2 className="font-semibold mb-2">Movimientos del día</h2>
          {snapshotConsulta.movimientos.length === 0 && <p className="text-gray-400 text-sm">Sin movimientos registrados.</p>}
          <ul className="text-sm">
            {snapshotConsulta.movimientos.map((m, idx) => (
              <li key={idx}>
                {m.tipo === 'cambio' && `${m.entraNombre} → ${m.saleNombre} (${m.entraNombre} vino por ${m.saleNombre}) — ${etiquetaHora(m.hora)}`}
                {m.tipo === 'refuerzo' && `${m.agenteNombre} — refuerzo — ${etiquetaHora(m.hora)}`}
                {m.tipo === 'retiro' && `${m.agenteNombre} — se retiró — ${etiquetaHora(m.hora)}`}
              </li>
            ))}
          </ul>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full bg-white shadow-md rounded">
            <thead>
              <tr>
                <th className="border p-2 w-32">{vistaSnap.nombre || 'Casillas'}</th>
                {Array.from({ length: 24 }, (_, h) => (
                  <th key={h} className="border p-2">{etiquetaHora(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vistaSnap.casillas.map((nombreCasilla, filaIdx) => (
                <tr key={filaIdx}>
                  <td className="border p-2 font-bold">{nombreCasilla}</td>
                  {vistaSnap.matriz[filaIdx].map((celda, h) => {
                    const agenteSnap = celda ? agentePorIdSnap(celda) : null;
                    return (
                      <td
                        key={h}
                        className="border p-2 w-20 h-10"
                        onClick={() => limpiarCeldaConsulta(vistaConsultaIdx, filaIdx, h)}
                      >
                        {agenteSnap && (
                          <div className={`${colorPara(celda)} text-white text-xs rounded p-1 text-center`}>
                            {agenteSnap.apellido}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-gray-100 min-h-screen">
      {confirmationModal.show && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-4 rounded">
            <p>¿Está seguro de que desea asignar una hora extra consecutiva a este agente?</p>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => {
                  confirmationModal.action();
                  setConfirmationModal({ show: false, action: null });
                }}
                className="bg-blue-500 text-white p-2 rounded mr-2"
              >
                Confirmar
              </button>
              <button onClick={() => setConfirmationModal({ show: false, action: null })} className="bg-red-500 text-white p-2 rounded">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarRefuerzo && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-4 rounded w-96">
            <h3 className="font-semibold mb-2">Refuerzo</h3>
            <input
              value={filtroRefuerzo}
              onChange={(e) => setFiltroRefuerzo(e.target.value)}
              className="border p-2 w-full mb-2"
              placeholder="Buscar agente..."
            />
            <div className="max-h-60 overflow-y-auto">
              {poolDisponibleParaSumar(filtroRefuerzo).map((a) => (
                <div
                  key={a.id}
                  onClick={() => confirmarRefuerzo(a.id)}
                  className="p-2 hover:bg-gray-100 cursor-pointer rounded"
                >
                  {a.apellido}, {a.nombre} {a.guardia && `(Guardia ${a.guardia})`}
                </div>
              ))}
            </div>
            <button onClick={() => setMostrarRefuerzo(false)} className="bg-gray-300 p-2 rounded mt-2 w-full">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {mostrarCambio && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-4 rounded w-96">
            <h3 className="font-semibold mb-2">Cambio por planilla</h3>
            <label className="block text-sm mb-1">¿A quién reemplaza? (ya presente hoy)</label>
            <select value={cambioSaleId} onChange={(e) => setCambioSaleId(e.target.value)} className="border p-2 w-full mb-2">
              <option value="">Elegir...</option>
              {activosPresentes.map((x) => (
                <option key={x.id} value={x.id}>{x.identidad.apellido}, {x.identidad.nombre}</option>
              ))}
            </select>
            <label className="block text-sm mb-1">¿Quién entra?</label>
            <select value={cambioEntraId} onChange={(e) => setCambioEntraId(e.target.value)} className="border p-2 w-full mb-2">
              <option value="">Elegir...</option>
              {poolDisponibleParaSumar('').map((a) => (
                <option key={a.id} value={a.id}>{a.apellido}, {a.nombre} {a.guardia && `(Guardia ${a.guardia})`}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button onClick={confirmarCambio} className="bg-blue-500 text-white p-2 rounded flex-1">Confirmar</button>
              <button onClick={() => setMostrarCambio(false)} className="bg-gray-300 p-2 rounded flex-1">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {conflictoModal.show && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-4 rounded w-96">
            <h3 className="font-semibold mb-2">Ya está asignado en otra vista</h3>
            <p className="text-sm mb-4">
              Este agente ya está en <strong>{conflictoModal.conflicto?.vistaNombre || 'otra vista'}</strong>
              {' '}({conflictoModal.conflicto?.casillaNombre}) a las {etiquetaHora(conflictoModal.columnaDestino)}.
              ¿Cancelar la asignación acá, o reasignarlo (sacarlo de ahí y traerlo a esta vista)?
            </p>
            <div className="flex gap-2">
              <button onClick={resolverConflictoReasignar} className="bg-blue-500 text-white p-2 rounded flex-1">
                Reasignar acá
              </button>
              <button onClick={resolverConflictoCancelar} className="bg-gray-300 p-2 rounded flex-1">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-4 flex space-x-4 items-center flex-wrap gap-2">
        <select value={pasoActual.id} onChange={(e) => setSelectedPasoId(e.target.value)} className="border p-2 font-semibold">
          {pasos.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>
        <button
          onClick={recargarPasos}
          title="Recargar plantillas desde /plantillas si las editaste en otra pestaña"
          className="text-gray-500 hover:text-gray-700 text-sm"
        >
          🔄 Recargar plantilla
        </button>

        <select value={selectedTurnoId || ''} onChange={(e) => setSelectedTurnoId(e.target.value)} className="border p-2">
          {pasoActual.turnos.map((t) => (
            <option key={t.id} value={t.id}>{t.nombre}</option>
          ))}
        </select>

        {pasoActual.vistas.length > 1 && (
          <select value={selectedVistaId || ''} onChange={(e) => setSelectedVistaId(e.target.value)} className="border p-2">
            {pasoActual.vistas.map((v) => (
              <option key={v.id} value={v.id}>{v.nombre}</option>
            ))}
          </select>
        )}

        <Link to="/agentes" className="text-gray-500 hover:text-gray-700 flex items-center text-sm">
          <Users size={16} className="mr-1" /> Agentes
        </Link>
        <Link to="/plantillas" className="text-gray-500 hover:text-gray-700 flex items-center text-sm">
          <Settings size={16} className="mr-1" /> Plantillas
        </Link>
        <Link to="/estadisticas" className="bg-purple-500 text-white p-2 rounded flex items-center shadow hover:scale-105 transition-transform text-sm">
          <BarChart2 size={16} className="mr-2" /> Ver Estadísticas
        </Link>
      </div>

      {operativoPaso.activosHoyIds.length === 0 ? (
        <div className="bg-white p-4 rounded shadow mb-4">
          <h2 className="font-semibold mb-2">Iniciar jornada</h2>
          {(pasoActual.guardias || []).length > 0 ? (
            <div className="flex items-center gap-2">
              <select value={guardiaElegida} onChange={(e) => setGuardiaElegida(e.target.value)} className="border p-2">
                <option value="">Elegir guardia...</option>
                {pasoActual.guardias.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
              <button onClick={cargarGuardia} disabled={!guardiaElegida} className="bg-blue-500 text-white p-2 rounded disabled:opacity-50">
                Cargar guardia
              </button>
            </div>
          ) : (
            <button onClick={cargarGuardia} className="bg-blue-500 text-white p-2 rounded">
              Cargar agentes de este paso
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <button onClick={() => setMostrarRefuerzo(true)} className="bg-orange-500 text-white p-2 rounded shadow hover:scale-105 transition-transform">
              + Refuerzo
            </button>
            <button onClick={() => setMostrarCambio(true)} className="bg-orange-600 text-white p-2 rounded shadow hover:scale-105 transition-transform">
              Cambio por planilla
            </button>

            <div className="flex items-center gap-1 bg-gray-100 border border-gray-300 rounded p-1">
              <span className="text-xs text-gray-500 px-1">Limpiar:</span>
              <button onClick={limpiarMatriz} className="text-xs bg-white border p-1 rounded hover:bg-gray-50" title="Vacía la grilla, mantiene turno/equipo de cada agente">
                Matriz
              </button>
              <button onClick={reiniciarAsignaciones} className="text-xs bg-white border p-1 rounded hover:bg-gray-50" title="Todos vuelven a Pendientes de asignar, la grilla no se toca">
                Asignaciones
              </button>
              <button onClick={reiniciarTodoSinArchivo} className="text-xs bg-white border p-1 rounded hover:bg-gray-50" title="Reinicia todo sin descargar ningún archivo">
                Todo
              </button>
            </div>

            <button onClick={cerrarJornada} className="bg-red-600 text-white p-2 rounded shadow hover:scale-105 transition-transform ml-auto">
              Cerrar Jornada
            </button>
            <label className="bg-gray-300 text-gray-700 p-2 rounded cursor-pointer shadow hover:scale-105 transition-transform">
              Importar cierre
              <input type="file" accept=".json" onChange={importarCierre} className="hidden" />
            </label>
          </div>

          <div className="bg-white p-3 rounded shadow mb-4 flex gap-4 text-sm">
            <span className={sinTurno > 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}>{sinTurno} sin turno</span>
            <span className={sinEquipo > 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}>{sinEquipo} sin equipo</span>
            {pasoActual.vistas.length > 1 && (
              <span className={sinVista > 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}>{sinVista} sin vista</span>
            )}
          </div>

          {pendientes.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-300 p-4 rounded shadow mb-4">
              <h3 className="font-semibold mb-2">Pendientes de asignar</h3>
              {pendientes.map((x) => (
                <div key={x.id} className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="w-40">{x.identidad.apellido}, {x.identidad.nombre}</span>
                  <select
                    value={x.registro.turnoPrincipal || ''}
                    onChange={(e) => asignarCampoAgente(x.id, 'turnoPrincipal', e.target.value)}
                    className="border p-1"
                  >
                    <option value="">Turno...</option>
                    {pasoActual.turnos.map((t) => (
                      <option key={t.id} value={t.id}>{t.nombre}</option>
                    ))}
                  </select>
                  <select
                    value={x.registro.equipo || ''}
                    onChange={(e) => asignarCampoAgente(x.id, 'equipo', e.target.value)}
                    className="border p-1"
                  >
                    <option value="">Equipo...</option>
                    {pasoActual.equipos.map((eq) => (
                      <option key={eq} value={eq}>{eq}</option>
                    ))}
                  </select>
                  {pasoActual.vistas.length > 1 && (
                    <select
                      value={x.registro.vistaPrincipal || ''}
                      onChange={(e) => asignarCampoAgente(x.id, 'vistaPrincipal', e.target.value)}
                      className="border p-1"
                    >
                      <option value="">Vista...</option>
                      {pasoActual.vistas.map((v) => (
                        <option key={v.id} value={v.id}>{v.nombre}</option>
                      ))}
                    </select>
                  )}
                  <button onClick={() => retirarAgente(x.id)} className="text-red-500 hover:text-red-700 ml-auto flex items-center text-sm">
                    <LogOut size={14} className="mr-1" /> Retirar
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mb-4">
            <div className="flex items-center mb-2">
              <button
                onClick={() => setOrdenamiento(ordenamiento === 'alfabetico' ? 'horas' : 'alfabetico')}
                className="bg-gray-300 text-gray-700 p-2 rounded flex items-center shadow hover:scale-105 transition-transform"
              >
                <ArrowUpDown size={20} className="mr-2" />
                {ordenamiento === 'alfabetico' ? 'Ordenado alfabeticamente' : 'Ordenado por carga horaria'}
              </button>
            </div>

            <div className="flex space-x-4 flex-wrap gap-4">
              {ordenarAgentesPorEquipo().map(({ equipo, agentes: agentesDelEquipo }) => {
                const prestables = agentesOtraVista(equipo);
                return (
                  <div key={equipo} className="flex-1 bg-white p-4 rounded shadow min-w-[200px]">
                    <h3 className="text-lg font-semibold mb-2">{equipo}</h3>
                    <div className="flex flex-col gap-2">
                      {agentesDelEquipo.map((x) => (
                        <div
                          key={x.id}
                          className={`${colorPara(x.id)} p-2 rounded flex items-center text-white cursor-pointer shadow hover:scale-105 transition-transform`}
                          draggable
                          onDragStart={(e) => manejarDragStart(e, x.id)}
                        >
                          <span className="mr-2">
                            {x.identidad.apellido}, {x.identidad.nombre} ({horasPorAgente.get(x.id) || 0} h)
                          </span>
                          <button
                            onClick={() => retirarAgente(x.id)}
                            className="text-white ml-auto"
                            title="Retirar de la guardia"
                          >
                            <LogOut size={14} />
                          </button>
                        </div>
                      ))}
                    </div>

                    {pasoActual.vistas.length > 1 && (
                      <div className="mt-2 border-t pt-2">
                        <button
                          onClick={() => toggleOtrasVistas(equipo)}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          {otrasVistasAbiertas.has(equipo)
                            ? '- Ocultar agentes de otro sector'
                            : `+ Ver agentes de otro sector (${prestables.length})`}
                        </button>
                        {otrasVistasAbiertas.has(equipo) && (
                          <div className="flex flex-col gap-2 mt-2">
                            {prestables.length === 0 && (
                              <span className="text-xs text-gray-400">Nadie disponible en otro sector ahora.</span>
                            )}
                            {prestables.map((x) => (
                              <div
                                key={x.id}
                                className={`${colorPara(x.id)} p-2 rounded flex items-center text-white cursor-pointer shadow opacity-80 hover:opacity-100`}
                                draggable
                                onDragStart={(e) => manejarDragStart(e, x.id)}
                                title="Viene de otro sector — al asignarlo va a aparecer con el ícono de info"
                              >
                                <span className="mr-2">
                                  {x.identidad.apellido}, {x.identidad.nombre} —{' '}
                                  {pasoActual.vistas.find((v) => v.id === x.registro.vistaPrincipal)?.nombre}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="flex-1 bg-white p-4 rounded shadow opacity-90 min-w-[200px]">
                <h3 className="text-lg font-semibold mb-2">
                  Casilla {columnaEnVivoPantalla !== null ? `(${etiquetaHora(horaAbsolutaActual)})` : '(fuera de este turno)'}
                </h3>
                <div className="flex flex-col gap-2">
                  {agentesEnCasillaAhora.map((x) => {
                    const textoAjeno = infoAjeno(x.registro);
                    const chipKey = `casilla-${x.id}`;
                    return (
                      <div
                        key={x.id}
                        className={`relative ${colorPara(x.id)} p-2 rounded text-white shadow cursor-pointer`}
                        onClick={() => extenderCasilla(x.id)}
                        title="Click para sumarle la hora siguiente"
                      >
                        {x.identidad.apellido}, {x.identidad.nombre} ({horasPorAgente.get(x.id) || 0} h)
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            retirarAgente(x.id);
                          }}
                          className="ml-2"
                          title="Retirar"
                        >
                          <LogOut size={12} className="inline" />
                        </button>
                        {textoAjeno && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setInfoCelda(infoCelda === chipKey ? null : chipKey);
                            }}
                            className="absolute -top-1 -right-1 bg-white rounded-full shadow"
                            title="Vista y/o turno principal distinto al de esta pestaña"
                          >
                            <Info size={14} className="text-blue-600" />
                          </button>
                        )}
                        {textoAjeno && infoCelda === chipKey && (
                          <div className="absolute z-10 top-full left-0 mt-1 bg-black text-white text-xs p-1 rounded whitespace-nowrap shadow-lg">
                            {textoAjeno}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <h3 className="text-lg font-semibold mb-2">Seleccionar Horario</h3>
            <select
              className="border p-2 mb-2"
              value={selectedHorarioCasilla ?? ''}
              onChange={(e) => setSelectedHorarioCasilla(Number(e.target.value))}
            >
              <option value="" disabled>Selecciona un horario</option>
              {horasTurno.map((h, index) => (
                <option key={index} value={index}>{etiquetaHora(h)}</option>
              ))}
              <option value={-1}>Equipos</option>
            </select>
            <button
              onClick={generarTextoHorario}
              className="bg-blue-500 text-white p-2 rounded ml-2 cursor-pointer shadow hover:scale-105 transition-transform"
              disabled={selectedHorarioCasilla === null}
            >
              Generar Texto
            </button>
          </div>

          {horarioTexto && (
            <div className="mt-4 bg-white p-4 rounded shadow">
              <h3 className="text-lg font-semibold mb-2">Texto Generado</h3>
              <pre className="whitespace-pre-wrap">{horarioTexto}</pre>
              <button onClick={() => setHorarioTexto('')} className="bg-red-500 text-white p-2 rounded mt-2 shadow hover:scale-105 transition-transform">
                Eliminar Texto
              </button>
            </div>
          )}

          <div className="overflow-x-auto mt-4">
            <table className="w-full bg-white shadow-md rounded">
              <thead>
                <tr>
                  <th className="border p-2 w-32">{vistaActual.nombre || 'Casillas'}</th>
                  {horasTurno.map((h, index) => (
                    <th key={index} className={`border p-2 ${index === columnaEnVivoPantalla ? 'bg-yellow-100' : ''}`}>
                      {etiquetaHora(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vistaActual.casillas.map((casilla, filaIndex) => (
                  <tr key={casilla.id}>
                    <td className="border p-2 w-32 font-bold">{casilla.nombre}</td>
                    {horasTurno.map((h, columnaIndex) => {
                      const celda = matrizActual[filaIndex]?.[h] ?? null;
                      const identidad = celda ? identidadPorId(celda) : null;
                      const registro = celda ? operativoPaso.porAgente[celda] : null;
                      const textoAjeno = registro ? infoAjeno(registro) : null;
                      const cellKey = `${filaIndex}-${h}`;
                      return (
                        <td
                          key={columnaIndex}
                          className={`relative border p-2 w-24 h-12 ${columnaIndex === columnaEnVivoPantalla ? 'bg-yellow-50' : ''}`}
                          onDragOver={manejarDragOver}
                          onDrop={(e) => manejarDrop(e, filaIndex, columnaIndex)}
                          onClick={() => manejarClickFicha(filaIndex, columnaIndex)}
                        >
                          {identidad && (
                            <div
                              className={`w-full h-full flex items-center justify-center ${colorPara(celda)} text-white rounded cursor-pointer shadow hover:scale-105 transition-transform`}
                              draggable
                              onDragStart={(e) => manejarDragStart(e, celda, filaIndex, columnaIndex)}
                            >
                              {identidad.apellido}
                            </div>
                          )}
                          {textoAjeno && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setInfoCelda(infoCelda === cellKey ? null : cellKey);
                              }}
                              className="absolute -top-1 -right-1 bg-white rounded-full shadow"
                              title="Vista y/o turno principal distinto al de esta pestaña"
                            >
                              <Info size={14} className="text-blue-600" />
                            </button>
                          )}
                          {textoAjeno && infoCelda === cellKey && (
                            <div className="absolute z-10 top-full left-0 mt-1 bg-black text-white text-xs p-1 rounded whitespace-nowrap shadow-lg">
                              {textoAjeno}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

const App = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HorarioEditable />} />
        <Route path="/estadisticas" element={<EstadisticasCasillas />} />
        <Route path="/plantillas" element={<PasoManager />} />
        <Route path="/agentes" element={<AgentesManager />} />
      </Routes>
    </Router>
  );
};

export default App;
