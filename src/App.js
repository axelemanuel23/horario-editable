import React, { useState, useEffect, useMemo, useRef } from 'react';
import { BrowserRouter as Router, Route, Routes, Link } from 'react-router-dom';
import { Plus, Trash2, ArrowUpDown, BarChart2, Info, Settings } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import Papa from 'papaparse';
import EstadisticasCasillas from './EstadisticasCasillas';
import PasoManager from './PasoManager';

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

// Arma la secuencia de horas (0-23) que corresponde a un turno,
// caminando desde horaInicio hasta horaFin (exclusive), con wraparound
// de medianoche. Cada posición de este array es la "columna de
// pantalla" i; el valor es la "columna absoluta" real en la matriz.
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

const HorarioEditable = () => {
  const [pasos] = useState(() => {
    const saved = localStorage.getItem('pasos_v1');
    return saved ? JSON.parse(saved) : [];
  });

  const [selectedPasoId, setSelectedPasoId] = useState(() => {
    const saved = localStorage.getItem('selectedPasoId_v1');
    return saved || null;
  });

  const pasoActual = pasos.find((p) => p.id === selectedPasoId) || pasos[0] || null;

  useEffect(() => {
    if (pasoActual) localStorage.setItem('selectedPasoId_v1', pasoActual.id);
  }, [pasoActual]);

  const [selectedVistaId, setSelectedVistaId] = useState(null);
  const [selectedTurnoId, setSelectedTurnoId] = useState(null);

  // Cuando cambia el paso activo, reancla vista y turno seleccionados a
  // algo válido dentro de ese paso.
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

  const [agentes, setAgentes] = useState(() => {
    const saved = localStorage.getItem('agentes_v3');
    return saved ? JSON.parse(saved) : [];
  });

  const [matrices, setMatrices] = useState(() => {
    const saved = localStorage.getItem('matrices_v3');
    return saved ? JSON.parse(saved) : {};
  });

  const [lastProcessedHour, setLastProcessedHour] = useState(() => {
    const saved = localStorage.getItem('lastProcessedHour_v3');
    return saved !== null ? Number(saved) : null;
  });

  const [tick, setTick] = useState(0);

  const [confirmationModal, setConfirmationModal] = useState({ show: false, action: null });
  const [selectedHorarioCasilla, setSelectedHorarioCasilla] = useState(null);
  const [horarioTexto, setHorarioTexto] = useState('');
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoApellido, setNuevoApellido] = useState('');
  const [nuevoEquipo, setNuevoEquipo] = useState('');
  const [nuevoVistaPrincipal, setNuevoVistaPrincipal] = useState(null);
  const [nuevoTurnoPrincipal, setNuevoTurnoPrincipal] = useState(null);
  const [ordenamiento, setOrdenamiento] = useState('alfabetico');
  const [infoCelda, setInfoCelda] = useState(null);

  const [importedData, setImportedData] = useState(null);

  const agentesRef = useRef(agentes);
  const matricesRef = useRef(matrices);
  agentesRef.current = agentes;
  matricesRef.current = matrices;

  // Reancla los defaults de registro cuando cambia el paso/vista/turno
  // activos, para que el formulario arranque en algo válido.
  useEffect(() => {
    if (pasoActual) setNuevoEquipo(pasoActual.equipos[0] || '');
  }, [pasoActual]);
  useEffect(() => {
    setNuevoVistaPrincipal(selectedVistaId);
  }, [selectedVistaId]);
  useEffect(() => {
    setNuevoTurnoPrincipal(selectedTurnoId);
  }, [selectedTurnoId]);

  useEffect(() => {
    if (importedData) {
      setAgentes(importedData.nuevosAgentes);
      setMatrices(importedData.nuevasMatrices);
      setImportedData(null);
    }
  }, [importedData]);

  useEffect(() => {
    localStorage.setItem('agentes_v3', JSON.stringify(agentes));
  }, [agentes]);

  useEffect(() => {
    localStorage.setItem('matrices_v3', JSON.stringify(matrices));
  }, [matrices]);

  useEffect(() => {
    if (lastProcessedHour !== null) {
      localStorage.setItem('lastProcessedHour_v3', String(lastProcessedHour));
    }
  }, [lastProcessedHour]);

  const limpiarLocalStorage = () => {
    localStorage.removeItem('agentes_v3');
    localStorage.removeItem('matrices_v3');
    localStorage.removeItem('lastProcessedHour_v3');
    setAgentes([]);
    setMatrices({});
    setLastProcessedHour(null);
  };

  // =========================================================
  // INTERCAMBIO DE EQUIPO AL HABER RELEVO EN CASILLA
  //
  // Usa la hora ABSOLUTA real del reloj (0-23), no la posición dentro
  // del turno que esté seleccionado en pantalla — así la lógica corre
  // igual sin importar qué pestaña tengas abierta en ese momento.
  // =========================================================

  function procesarTransicionHoraria(columnaAnterior, columnaNueva) {
    if (!pasoActual) return;
    const agentesActuales = agentesRef.current;
    const mapaEquipos = new Map(agentesActuales.map((a) => [a.id, a.equipo]));

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

    setAgentes(
      agentesActuales.map((a) => ({ ...a, equipo: mapaEquipos.get(a.id) ?? a.equipo }))
    );
  }

  useEffect(() => {
    if (!pasoActual) return;
    const revisarHora = () => {
      setTick((t) => t + 1);
      const horaActual = new Date().getHours();

      setLastProcessedHour((prevHora) => {
        if (prevHora === null) return horaActual; // primer chequeo: solo ancla, no procesa
        if (prevHora === horaActual) return prevHora;

        let h = prevHora;
        let pasos = 0;
        while (h !== horaActual && pasos < HORAS_DIA) {
          const siguiente = (h + 1) % HORAS_DIA;
          procesarTransicionHoraria(h, siguiente);
          h = siguiente;
          pasos++;
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

  const agentePorId = (id) => agentes.find((a) => a.id === id);
  const nombreCompleto = (agente) => `${agente.nombre} ${agente.apellido}`;

  const matrizActual = useMemo(() => {
    if (!pasoActual || !vistaActual) return [];
    return matrices[matrizKey(pasoActual.id, vistaActual.id)] || crearMatrizVacia(vistaActual.casillas.length);
  }, [matrices, pasoActual, vistaActual]);

  const setMatrizActual = (nuevaMatriz) => {
    setMatrices({ ...matrices, [matrizKey(pasoActual.id, vistaActual.id)]: nuevaMatriz });
  };

  const horasTurno = useMemo(
    () => (turnoActual ? construirHorasTurno(turnoActual.horaInicio, turnoActual.horaFin) : []),
    [turnoActual]
  );

  // Índice de PANTALLA (posición dentro de horasTurno) que corresponde
  // a la hora real ahora mismo, o null si el turno seleccionado no
  // incluye la hora actual. Solo se usa para resaltar visualmente.
  const columnaEnVivoPantalla = useMemo(() => {
    const horaActual = new Date().getHours();
    const idx = horasTurno.indexOf(horaActual);
    return idx === -1 ? null : idx;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horasTurno, tick]);

  const horaAbsolutaActual = new Date().getHours();

  const nombreCasilla = (vista, fila) => vista.casillas[fila]?.nombre ?? `Casilla ${fila + 1}`;

  const CAPITALIZAR = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  // Un agente es "ajeno" a lo que estás mirando si su vista principal
  // y/o turno principal no coinciden con la vista/turno seleccionados.
  // Si el paso tiene una sola vista, esa comparación nunca aplica (no
  // hay nada contra qué diferir) — se cae sola, sin bandera especial.
  const infoAjeno = (agente) => {
    if (!pasoActual) return null;
    const vistaAgente = pasoActual.vistas.find((v) => v.id === agente.vistaPrincipal);
    const turnoAgente = pasoActual.turnos.find((t) => t.id === agente.turnoPrincipal);

    const ajenoVista = pasoActual.vistas.length > 1 && agente.vistaPrincipal !== selectedVistaId;
    const ajenoTurno = agente.turnoPrincipal !== selectedTurnoId;
    if (!ajenoVista && !ajenoTurno) return null;

    const partes = [];
    if (ajenoVista && vistaAgente) partes.push(vistaAgente.nombre);
    if (ajenoTurno && turnoAgente) partes.push(`turno ${CAPITALIZAR(turnoAgente.nombre)}`);
    return partes.length ? `Agente de ${partes.join(' — ')}` : null;
  };

  // IDs de agentes ocupando cualquier casilla, de cualquier vista del
  // paso activo, en la hora real de ahora.
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

  // Horas totales asignadas a cada agente, contando TODAS las vistas
  // del paso activo (24 columnas cada una).
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
  // EXPORTAR / IMPORTAR CSV
  // =========================================================

  const exportarCSV = () => {
    if (!pasoActual || !vistaActual || !turnoActual) return;

    const filasMatrizVentana = matrizActual.map((fila) =>
      horasTurno.map((h) => (fila[h] ? nombreCompleto(agentePorId(fila[h])) : ''))
    );
    const filasMatrizNombres = filasMatrizVentana.map((fila) => fila.map((n) => n || ''));

    const datosCSV = [
      ['tipo', 'id', 'nombre', 'apellido', 'horas', 'equipo', 'color', 'vistaPrincipal', 'turnoPrincipal'],
      ...agentes
        .filter((a) => a.paso === pasoActual.id)
        .map((a) => [
          'agente', a.id, a.nombre, a.apellido, horasPorAgente.get(a.id) || 0, a.equipo, a.color,
          a.vistaPrincipal, a.turnoPrincipal,
        ]),
      ['paso', pasoActual.id, pasoActual.nombre],
      ['encabezado', vistaActual.nombre || '', ...vistaActual.casillas.map((c) => c.nombre)],
      ['horario', ...horasTurno.map(etiquetaHora)],
      ...filasMatrizNombres.map((fila, index) => ['matriz', index, ...fila]),
    ];

    const csvContent = Papa.unparse(datosCSV);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const fecha = new Date();
    fecha.setHours(fecha.getHours() - 3);
    const fechaActual = fecha.toISOString().slice(0, 19).replace(/:/g, '-');
    link.setAttribute('download', `${pasoActual.nombre}_${vistaActual.nombre || 'unica'}_${turnoActual.nombre}_${fechaActual}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const importarCSV = (event) => {
    const file = event.target.files[0];
    if (!file || !pasoActual || !vistaActual) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const parsedData = Papa.parse(e.target.result, { header: false }).data;

      const nuevosAgentesImportados = [];
      let horariosImportados = [];
      const filasMatrizPorNombre = [];

      parsedData.forEach((fila) => {
        switch (fila[0]) {
          case 'agente':
            nuevosAgentesImportados.push({
              id: fila[1],
              nombre: fila[2],
              apellido: fila[3],
              horas: parseInt(fila[4], 10),
              equipo: fila[5],
              color: fila[6],
              vistaPrincipal: fila[7],
              turnoPrincipal: fila[8],
              paso: pasoActual.id,
            });
            break;
          case 'horario':
            horariosImportados = fila.slice(1);
            break;
          case 'matriz':
            filasMatrizPorNombre.push(fila.slice(2));
            break;
          default:
            break;
        }
      });

      const idPorNombre = new Map(
        nuevosAgentesImportados.map((a) => [`${a.nombre} ${a.apellido}`, a.id])
      );

      const horasAbsolutasImportadas = horariosImportados.map((h) => parseInt(h.split(':')[0], 10));

      const matrizNueva = crearMatrizVacia(vistaActual.casillas.length);
      filasMatrizPorNombre.forEach((fila, filaIdx) => {
        if (filaIdx >= matrizNueva.length) return;
        fila.forEach((nombre, i) => {
          const horaAbs = horasAbsolutasImportadas[i];
          if (nombre && horaAbs !== undefined) {
            matrizNueva[filaIdx][horaAbs] = idPorNombre.get(nombre) ?? null;
          }
        });
      });

      const agentesRestantes = agentes.filter((a) => a.paso !== pasoActual.id);

      setImportedData({
        nuevosAgentes: [...agentesRestantes, ...nuevosAgentesImportados],
        nuevasMatrices: { ...matrices, [matrizKey(pasoActual.id, vistaActual.id)]: matrizNueva },
      });
    };

    reader.readAsText(file);
  };

  const generarTextoHorario = () => {
    if (selectedHorarioCasilla === null || !pasoActual) return;
    let texto = '';
    if (selectedHorarioCasilla === -1) {
      texto += `-- Equipos --\n`;
      pasoActual.equipos.forEach((equipo) => {
        texto += `${equipo}:\n`;
        agentesDelPaso
          .filter((a) => a.equipo === equipo && !idsEnCasillaAhora.has(a.id))
          .forEach((a) => {
            texto += ` - ${a.nombre} ${a.apellido}\n`;
          });
      });
      texto += `Casilla:\n`;
      agentesDelPaso
        .filter((a) => idsEnCasillaAhora.has(a.id))
        .forEach((a) => {
          texto += ` - ${a.nombre} ${a.apellido}\n`;
        });
    } else {
      const horaAbs = horasTurno[selectedHorarioCasilla];
      texto += `Horario: ${etiquetaHora(horaAbs)}\n`;
      matrizActual.forEach((fila, indexFila) => {
        if (fila[horaAbs]) {
          const agente = agentePorId(fila[horaAbs]);
          texto += `${nombreCasilla(vistaActual, indexFila)}: ${agente ? nombreCompleto(agente) : '?'}\n`;
        }
      });
    }
    setHorarioTexto(texto.trim());
  };

  const eliminarTextoHorario = () => setHorarioTexto('');

  const agentesDelPaso = pasoActual ? agentes.filter((a) => a.paso === pasoActual.id) : [];

  const agregarAgente = () => {
    if (!pasoActual || nuevoNombre.trim() === '' || nuevoApellido.trim() === '') return;
    const color = colors[agentesDelPaso.length % colors.length];
    const nuevoAgente = {
      id: uuidv4(),
      nombre: nuevoNombre,
      apellido: nuevoApellido,
      color,
      paso: pasoActual.id,
      equipo: nuevoEquipo,
      vistaPrincipal: nuevoVistaPrincipal,
      turnoPrincipal: nuevoTurnoPrincipal,
    };
    setAgentes([...agentes, nuevoAgente]);
    setNuevoNombre('');
    setNuevoApellido('');
  };

  const eliminarAgente = (id) => {
    setAgentes(agentes.filter((a) => a.id !== id));
    const nuevasMatrices = { ...matrices };
    Object.keys(nuevasMatrices).forEach((key) => {
      nuevasMatrices[key] = nuevasMatrices[key].map((fila) => fila.map((c) => (c === id ? null : c)));
    });
    setMatrices(nuevasMatrices);
  };

  const manejarDragStart = (e, agenteId, fila, columna) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ agenteId, fila, columna }));
  };

  const manejarDragOver = (e) => e.preventDefault();

  const manejarDropEquipo = (e, nuevoEquipoDestino) => {
    e.preventDefault();
    const { agenteId } = JSON.parse(e.dataTransfer.getData('text'));
    setAgentes(agentes.map((a) => (a.id === agenteId ? { ...a, equipo: nuevoEquipoDestino } : a)));
  };

  // Un agente ocupa como mucho una casilla a la vez en una hora dada:
  // se chequean TODAS las vistas del paso, no solo la que está en
  // pantalla.
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

  // Circular (módulo 24) para que el cruce de medianoche cuente como
  // adyacente — necesario para los turnos que cruzan las 00:00.
  const verificarHorasConsecutivas = (matriz, columnaAbsoluta, agenteId) => {
    let horasConsecutivas = 1;
    let i = (columnaAbsoluta + HORAS_DIA - 1) % HORAS_DIA;
    let pasos = 0;
    while (pasos < HORAS_DIA - 1) {
      const columnaChequeada = i;
      if (!matriz.some((row) => row[columnaChequeada] === agenteId)) break;
      horasConsecutivas++;
      i = (i + HORAS_DIA - 1) % HORAS_DIA;
      pasos++;
    }
    i = (columnaAbsoluta + 1) % HORAS_DIA;
    pasos = 0;
    while (pasos < HORAS_DIA - 1) {
      const columnaChequeada = i;
      if (!matriz.some((row) => row[columnaChequeada] === agenteId)) break;
      horasConsecutivas++;
      i = (i + 1) % HORAS_DIA;
      pasos++;
    }
    return horasConsecutivas >= 3;
  };

  const manejarDrop = (e, fila, columnaPantalla) => {
    e.preventDefault();
    const { agenteId, fila: filaOrigen, columna: columnaOrigenPantalla } = JSON.parse(
      e.dataTransfer.getData('text')
    );
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
      if (agenteYaEnColumna(columna, agenteId, null, null)) {
        alert('Ese agente ya está asignado en este horario.');
        return;
      }
      if (!nuevaMatriz[fila][columna]) {
        const aplicar = () => {
          nuevaMatriz[fila][columna] = agenteId;
          setMatrizActual(nuevaMatriz);
        };
        if (verificarHorasConsecutivas(nuevaMatriz, columna, agenteId)) {
          setConfirmationModal({ show: true, action: aplicar });
        } else {
          aplicar();
        }
      } else {
        alert('Esa posición ya está ocupada.');
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

  // Click en el chip de Casilla: suma la hora siguiente al agente en
  // función, buscando en TODAS las vistas del paso. Circular (módulo
  // 24) para que funcione también cruzando medianoche.
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

  const ordenarAgentesPorEquipo = () => {
    if (!pasoActual) return [];
    let ordenados = agentesDelPaso.filter(
      (a) =>
        !idsEnCasillaAhora.has(a.id) &&
        (pasoActual.vistas.length <= 1 || a.vistaPrincipal === selectedVistaId) &&
        a.turnoPrincipal === selectedTurnoId
    );

    if (ordenamiento === 'alfabetico') {
      ordenados = [...ordenados].sort((a, b) =>
        `${a.apellido} ${a.nombre}`.toLowerCase().localeCompare(`${b.apellido} ${b.nombre}`.toLowerCase())
      );
    } else {
      ordenados = [...ordenados].sort(
        (a, b) => (horasPorAgente.get(b.id) || 0) - (horasPorAgente.get(a.id) || 0)
      );
    }

    return pasoActual.equipos.map((equipo) => ({
      equipo,
      agentes: ordenados.filter((a) => a.equipo === equipo),
    }));
  };

  const agentesEnCasillaAhora = agentesDelPaso.filter((a) => idsEnCasillaAhora.has(a.id));

  // =========================================================
  // RENDER
  // =========================================================

  if (pasos.length === 0) {
    return (
      <div className="p-4 bg-gray-100 min-h-screen">
        <h1 className="text-2xl font-bold mb-4">Gestión de horarios</h1>
        <p className="mb-4">Todavía no hay ninguna plantilla de paso creada.</p>
        <Link to="/plantillas" className="bg-blue-500 text-white p-2 rounded inline-flex items-center">
          <Settings size={18} className="mr-2" /> Crear la primera plantilla
        </Link>
      </div>
    );
  }

  if (!pasoActual || !vistaActual || !turnoActual) {
    return <div className="p-4">Cargando…</div>;
  }

  return (
    <div className="p-4 bg-gray-100 min-h-screen">
      {confirmationModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
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
              <button
                onClick={() => setConfirmationModal({ show: false, action: null })}
                className="bg-red-500 text-white p-2 rounded"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-4 flex space-x-4 items-center flex-wrap gap-2">
        <select
          value={pasoActual.id}
          onChange={(e) => setSelectedPasoId(e.target.value)}
          className="border p-2 font-semibold"
        >
          {pasos.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>

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

        <Link to="/plantillas" className="text-gray-500 hover:text-gray-700 flex items-center text-sm">
          <Settings size={16} className="mr-1" /> Plantillas
        </Link>
      </div>

      <div className="mb-4">
        <h2 className="text-xl font-bold mb-2">Registrar Agentes</h2>
        <div className="flex items-center mb-2 flex-wrap gap-2">
          <input
            type="text"
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            className="border p-2"
            placeholder="Nombre"
          />
          <input
            type="text"
            value={nuevoApellido}
            onChange={(e) => setNuevoApellido(e.target.value)}
            className="border p-2"
            placeholder="Apellido"
          />
          <select value={nuevoEquipo} onChange={(e) => setNuevoEquipo(e.target.value)} className="border p-2">
            {pasoActual.equipos.map((equipo) => (
              <option key={equipo} value={equipo}>{equipo}</option>
            ))}
          </select>
          {pasoActual.vistas.length > 1 && (
            <select
              value={nuevoVistaPrincipal || ''}
              onChange={(e) => setNuevoVistaPrincipal(e.target.value)}
              className="border p-2"
              title="Vista principal"
            >
              {pasoActual.vistas.map((v) => (
                <option key={v.id} value={v.id}>{v.nombre}</option>
              ))}
            </select>
          )}
          <select
            value={nuevoTurnoPrincipal || ''}
            onChange={(e) => setNuevoTurnoPrincipal(e.target.value)}
            className="border p-2"
            title="Turno principal"
          >
            {pasoActual.turnos.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
          <button onClick={agregarAgente} className="bg-blue-500 text-white p-2 rounded">
            <Plus size={20} />
          </button>
        </div>

        <div className="mt-4 mb-4 flex items-center gap-2">
          <button onClick={exportarCSV} className="bg-green-500 text-white p-2 rounded shadow hover:scale-105 transition-transform">
            Exportar a CSV
          </button>
          <input type="file" accept=".csv" onChange={importarCSV} className="p-2 border" />
          <Link to="/estadisticas" className="bg-purple-500 text-white p-2 rounded flex items-center shadow hover:scale-105 transition-transform">
            <BarChart2 size={20} className="mr-2" /> Ver Estadísticas
          </Link>
        </div>

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
          {ordenarAgentesPorEquipo().map(({ equipo, agentes: agentesDelEquipo }) => (
            <div
              key={equipo}
              className="flex-1 bg-white p-4 rounded shadow min-w-[200px]"
              onDragOver={manejarDragOver}
              onDrop={(e) => manejarDropEquipo(e, equipo)}
            >
              <h3 className="text-lg font-semibold mb-2">{equipo}</h3>
              <div className="flex flex-col gap-2">
                {agentesDelEquipo.map((agente) => (
                  <div
                    key={agente.id}
                    className={`${agente.color} p-2 rounded flex items-center text-white cursor-pointer shadow hover:scale-105 transition-transform`}
                    draggable
                    onDragStart={(e) => manejarDragStart(e, agente.id)}
                  >
                    <span className="mr-2">{agente.apellido}, {agente.nombre} ({horasPorAgente.get(agente.id) || 0} h)</span>
                    <button onClick={() => eliminarAgente(agente.id)} className="text-red-200 hover:text-red-100 ml-auto">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="flex-1 bg-white p-4 rounded shadow opacity-90 min-w-[200px]">
            <h3 className="text-lg font-semibold mb-2">
              Casilla {columnaEnVivoPantalla !== null ? `(${etiquetaHora(horaAbsolutaActual)})` : '(fuera de este turno)'}
            </h3>
            <div className="flex flex-col gap-2">
              {agentesEnCasillaAhora.map((agente) => {
                const textoAjeno = infoAjeno(agente);
                const chipKey = `casilla-${agente.id}`;
                return (
                  <div
                    key={agente.id}
                    className={`relative ${agente.color} p-2 rounded text-white shadow cursor-pointer`}
                    onClick={() => extenderCasilla(agente.id)}
                    title="Click para sumarle la hora siguiente"
                  >
                    {agente.apellido}, {agente.nombre} ({horasPorAgente.get(agente.id) || 0} h)
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

        <button onClick={limpiarLocalStorage} className="bg-red-500 text-white p-2 rounded mt-4 shadow hover:scale-105 transition-transform">
          Borrar Todo <Trash2 size={14} />
        </button>
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
          <button onClick={eliminarTextoHorario} className="bg-red-500 text-white p-2 rounded mt-2 shadow hover:scale-105 transition-transform">
            Eliminar Texto
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
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
                  const agente = celda ? agentePorId(celda) : null;
                  const textoAjeno = agente ? infoAjeno(agente) : null;
                  const cellKey = `${filaIndex}-${h}`;
                  return (
                    <td
                      key={columnaIndex}
                      className={`relative border p-2 w-24 h-12 ${columnaIndex === columnaEnVivoPantalla ? 'bg-yellow-50' : ''}`}
                      onDragOver={manejarDragOver}
                      onDrop={(e) => manejarDrop(e, filaIndex, columnaIndex)}
                      onClick={() => manejarClickFicha(filaIndex, columnaIndex)}
                    >
                      {agente && (
                        <div
                          className={`w-full h-full flex items-center justify-center ${agente.color} text-white rounded cursor-pointer shadow hover:scale-105 transition-transform`}
                          draggable
                          onDragStart={(e) => manejarDragStart(e, agente.id, filaIndex, columnaIndex)}
                        >
                          {agente.apellido}
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
      </Routes>
    </Router>
  );
};

export default App;
