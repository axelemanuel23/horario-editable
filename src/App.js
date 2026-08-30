import React, { useState, useEffect, useMemo, useRef } from 'react';
import { BrowserRouter as Router, Route, Routes, Link } from 'react-router-dom';
import { Plus, Trash2, ArrowUpDown, BarChart2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import Papa from 'papaparse';
import EstadisticasCasillas from './EstadisticasCasillas';

const colors = [
  'bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500',
  'bg-pink-500', 'bg-indigo-500', 'bg-teal-500', 'bg-orange-500', 'bg-cyan-500'
];

// =========================================================
// CATÁLOGO FIJO DE CASILLAS (compartido en concepto con el
// motor automático de balanceo: Entrada 1-16, Salida 1-11).
// Ya no son encabezados editables a mano: el número identifica
// la casilla de forma inequívoca.
// =========================================================

const BOOTH_CATALOG = { entrada: 16, salida: 11 };
const SECTOR_LABEL = { entrada: 'Entradas', salida: 'Salidas' };

function boothLabel(sector, numero) {
  return `${sector === 'entrada' ? 'Entrada' : 'Salida'} ${numero}`;
}

function crearMatrizVacia(filas, columnas) {
  return Array(filas).fill().map(() => Array(columnas).fill(null));
}

// Los únicos equipos "base" que se asignan a mano. "Casilla" ya no es
// un equipo manual: se calcula solo, mirando quién tiene una celda
// asignada en la hora vigente.
const EQUIPOS = ['Micro', 'Corredor'];

const SHIFT_HORARIOS = {
  mañana: ['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00'],
  tarde: ['15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00', '00:00'],
  noche: ['21:00', '22:00', '23:00', '00:00', '01:00', '02:00', '03:00', '04:00', '05:00', '06:00'],
};

// =========================================================
// UTILIDADES DE TIEMPO
//
// Convierte cada etiqueta de hora del turno en "minutos desde el
// inicio del turno", resolviendo el cruce de medianoche (necesario
// para el turno noche). Con eso se puede ubicar en qué columna cae
// el momento actual del reloj.
// =========================================================

function horaAMinutos(hora) {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

function minutosDesdeInicioTurno(horarios) {
  const inicio = horaAMinutos(horarios[0]);
  return horarios.map((hora) => {
    const minutos = horaAMinutos(hora);
    return minutos >= inicio ? minutos - inicio : minutos + 24 * 60 - inicio;
  });
}

// Devuelve el índice de columna que corresponde a la hora actual del
// reloj para el turno dado, o null si el turno seleccionado no
// corresponde a la hora real (ej. tenés seleccionado "mañana" pero es
// de noche). Cada columna cubre una hora completa desde su etiqueta.
function obtenerColumnaActual(horarios) {
  const ahora = new Date();
  const inicio = horaAMinutos(horarios[0]);
  let minutosAhora = ahora.getHours() * 60 + ahora.getMinutes() - inicio;
  if (minutosAhora < 0) minutosAhora += 24 * 60;

  const columnasEnMinutos = minutosDesdeInicioTurno(horarios);

  for (let i = 0; i < columnasEnMinutos.length; i++) {
    const inicioColumna = columnasEnMinutos[i];
    const finColumna = inicioColumna + 60;
    if (minutosAhora >= inicioColumna && minutosAhora < finColumna) {
      return i;
    }
  }
  return null;
}

const HorarioEditable = () => {
  const [selectedShift, setSelectedShift] = useState('mañana');
  const [selectedSector, setSelectedSector] = useState('entrada');
  const [horarios, setHorarios] = useState(SHIFT_HORARIOS['mañana']);

  const [agentes, setAgentes] = useState(() => {
    const saved = localStorage.getItem('agentes_v2');
    return saved ? JSON.parse(saved) : [];
  });

  const [matrizEntrada, setMatrizEntrada] = useState(() => {
    const saved = localStorage.getItem('matrizEntrada_v2');
    return saved ? JSON.parse(saved) : crearMatrizVacia(BOOTH_CATALOG.entrada, 10);
  });

  const [matrizSalida, setMatrizSalida] = useState(() => {
    const saved = localStorage.getItem('matrizSalida_v2');
    return saved ? JSON.parse(saved) : crearMatrizVacia(BOOTH_CATALOG.salida, 10);
  });

  const [lastProcessedColumnIndex, setLastProcessedColumnIndex] = useState(() => {
    const saved = localStorage.getItem('lastProcessedColumnIndex_v2');
    return saved !== null ? Number(saved) : 0;
  });
  // Contador que solo sirve para forzar un refresco de pantalla cada
  // 30s (la hora del reloj cambia aunque el estado de React no se
  // entere solo). No participa de ninguna lógica de negocio.
  const [tick, setTick] = useState(0);

  const [confirmationModal, setConfirmationModal] = useState({ show: false, action: null });
  const [selectedHorarioCasilla, setSelectedHorarioCasilla] = useState(null);
  const [horarioTexto, setHorarioTexto] = useState('');
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoApellido, setNuevoApellido] = useState('');
  const [nuevoSector, setNuevoSector] = useState('Micro');
  const [ordenamiento, setOrdenamiento] = useState('alfabetico');

  const [importedData, setImportedData] = useState(null);

  // Refs con el estado más reciente, para que el chequeo horario (que
  // corre en un setInterval) siempre lea datos actuales sin quedar
  // atado a un closure viejo.
  const agentesRef = useRef(agentes);
  const matrizEntradaRef = useRef(matrizEntrada);
  const matrizSalidaRef = useRef(matrizSalida);
  agentesRef.current = agentes;
  matrizEntradaRef.current = matrizEntrada;
  matrizSalidaRef.current = matrizSalida;

  useEffect(() => {
    if (importedData) {
      setAgentes(importedData.nuevosAgentes);
      setMatrizEntrada(importedData.nuevaMatrizEntrada);
      setMatrizSalida(importedData.nuevaMatrizSalida);
      setSelectedSector(importedData.selectedSector);
      setSelectedShift(importedData.selectedShift);
      setImportedData(null);
    }
  }, [importedData]);

  useEffect(() => {
    setHorarios(SHIFT_HORARIOS[selectedShift]);
  }, [selectedShift]);

  useEffect(() => {
    localStorage.setItem('agentes_v2', JSON.stringify(agentes));
  }, [agentes]);

  useEffect(() => {
    localStorage.setItem('matrizEntrada_v2', JSON.stringify(matrizEntrada));
  }, [matrizEntrada]);

  useEffect(() => {
    localStorage.setItem('matrizSalida_v2', JSON.stringify(matrizSalida));
  }, [matrizSalida]);

  useEffect(() => {
    localStorage.setItem('lastProcessedColumnIndex_v2', String(lastProcessedColumnIndex));
  }, [lastProcessedColumnIndex]);

  // =========================================================
  // INTERCAMBIO DE EQUIPO AL HABER RELEVO EN CASILLA
  //
  // Una vez por hora (chequeado cada 30s por si la pestaña estuvo
  // cerrada y hay que ponerse al día con varias horas de una vez):
  // compara la columna anterior contra la nueva, casilla por casilla,
  // en ambos sectores. Si alguien nuevo ocupó la casilla de otro que
  // se retira, el que se retira hereda el equipo (Micro/Corredor) que
  // tenía el que llega, en ese mismo momento. Si la casilla quedó
  // vacía sin relevo, no se toca nada: el que se retira ya vuelve a
  // aparecer en su equipo de siempre, porque nunca se le modificó.
  // =========================================================

  function procesarTransicionHoraria(columnaAnterior, columnaNueva) {
    const agentesActuales = agentesRef.current;
    const mapaSectores = new Map(agentesActuales.map((a) => [a.id, a.sector]));

    const aplicarTransicion = (matriz) => {
      for (const fila of matriz) {
        const anterior = fila[columnaAnterior];
        const nueva = fila[columnaNueva];
        if (anterior && nueva && anterior !== nueva) {
          // El que se retira hereda el equipo del que llega (leído
          // antes de aplicar ningún cambio en este mismo tick).
          mapaSectores.set(anterior, mapaSectores.get(nueva));
        }
      }
    };

    aplicarTransicion(matrizEntradaRef.current);
    aplicarTransicion(matrizSalidaRef.current);

    setAgentes(
      agentesActuales.map((a) => ({ ...a, sector: mapaSectores.get(a.id) ?? a.sector }))
    );
  }

  useEffect(() => {
    const revisarHora = () => {
      setTick((t) => t + 1);
      const columnaActual = obtenerColumnaActual(horarios);
      if (columnaActual === null) return;

      setLastProcessedColumnIndex((prevIdx) => {
        let idx = prevIdx;
        while (idx < columnaActual) {
          procesarTransicionHoraria(idx, idx + 1);
          idx++;
        }
        return columnaActual;
      });
    };

    revisarHora();
    const interval = setInterval(revisarHora, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horarios]);

  const limpiarLocalStorage = () => {
    localStorage.removeItem('agentes_v2');
    localStorage.removeItem('matrizEntrada_v2');
    localStorage.removeItem('matrizSalida_v2');
    localStorage.removeItem('lastProcessedColumnIndex_v2');

    setAgentes([]);
    setMatrizEntrada(crearMatrizVacia(BOOTH_CATALOG.entrada, 10));
    setMatrizSalida(crearMatrizVacia(BOOTH_CATALOG.salida, 10));
    setLastProcessedColumnIndex(0);
  };

  // =========================================================
  // HELPERS DE AGENTE POR ID
  // =========================================================

  const agentePorId = (id) => agentes.find((a) => a.id === id);
  const nombreCompleto = (agente) => `${agente.nombre} ${agente.apellido}`;

  const matrizActual = selectedSector === 'entrada' ? matrizEntrada : matrizSalida;
  const setMatrizActual = selectedSector === 'entrada' ? setMatrizEntrada : setMatrizSalida;

  const encabezadosFilas = useMemo(
    () =>
      Array.from({ length: BOOTH_CATALOG[selectedSector] }, (_, i) =>
        boothLabel(selectedSector, i + 1)
      ),
    [selectedSector]
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const columnaEnVivo = useMemo(() => obtenerColumnaActual(horarios), [horarios, tick]);

  // IDs de agentes ocupando cualquier casilla (de cualquier sector) en
  // la columna vigente ahora mismo.
  const idsEnCasillaAhora = useMemo(() => {
    if (columnaEnVivo === null) return new Set();
    const ids = new Set();
    matrizEntrada.forEach((fila) => {
      if (fila[columnaEnVivo]) ids.add(fila[columnaEnVivo]);
    });
    matrizSalida.forEach((fila) => {
      if (fila[columnaEnVivo]) ids.add(fila[columnaEnVivo]);
    });
    return ids;
  }, [matrizEntrada, matrizSalida, columnaEnVivo]);

  // Horas totales ya asignadas a cada agente, contando celdas ocupadas
  // en TODA la grilla (ambos sectores). Se calcula, no se guarda: así
  // nunca queda desincronizado de lo que realmente hay en la matriz.
  const horasPorAgente = useMemo(() => {
    const conteo = new Map();
    const contar = (matriz) => {
      matriz.forEach((fila) => {
        fila.forEach((id) => {
          if (id) conteo.set(id, (conteo.get(id) || 0) + 1);
        });
      });
    };
    contar(matrizEntrada);
    contar(matrizSalida);
    return conteo;
  }, [matrizEntrada, matrizSalida]);

  // =========================================================
  // EXPORTAR / IMPORTAR CSV
  //
  // Se sigue exportando el NOMBRE resuelto (no el ID crudo) para que
  // el archivo siga siendo compatible con EstadisticasCasillas, que
  // lee nombres. Al importar, se resuelve el nombre contra la lista
  // de agentes del mismo archivo para recuperar el ID interno.
  // =========================================================

  const exportarCSV = () => {
    const matrizConNombres = matrizActual.map((fila) =>
      fila.map((id) => (id ? nombreCompleto(agentePorId(id)) : ''))
    );

    const datosCSV = [
      ['tipo', 'id', 'nombre', 'apellido', 'horas', 'sector', 'color'],
      ...agentes.map((a) => ['agente', a.id, a.nombre, a.apellido, horasPorAgente.get(a.id) || 0, a.sector, a.color]),
      ['encabezado', selectedSector, ...encabezadosFilas],
      ['horario', ...horarios],
      ...matrizConNombres.map((fila, index) => ['matriz', index, ...fila]),
    ];

    const csvContent = Papa.unparse(datosCSV);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const fecha = new Date();
    fecha.setHours(fecha.getHours() - 3);
    const fechaActual = fecha.toISOString().slice(0, 19).replace(/:/g, '-');
    link.setAttribute('download', `${selectedSector}_${selectedShift}_${fechaActual}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const importarCSV = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const parsedData = Papa.parse(e.target.result, { header: false }).data;

      const nuevosAgentes = [];
      let nuevosHorarios = [];
      const filasMatrizPorNombre = [];
      let sectorImportado = '';
      let turnoImportado = '';

      parsedData.forEach((fila) => {
        switch (fila[0]) {
          case 'agente':
            nuevosAgentes.push({
              id: fila[1],
              nombre: fila[2],
              apellido: fila[3],
              horas: parseInt(fila[4], 10),
              sector: fila[5],
              color: fila[6],
            });
            break;
          case 'encabezado':
            sectorImportado = fila[1];
            break;
          case 'horario':
            nuevosHorarios = fila.slice(1);
            if (nuevosHorarios[0] === '06:00') turnoImportado = 'mañana';
            else if (nuevosHorarios[0] === '15:00') turnoImportado = 'tarde';
            else if (nuevosHorarios[0] === '21:00') turnoImportado = 'noche';
            break;
          case 'matriz':
            filasMatrizPorNombre.push(fila.slice(2));
            break;
          default:
            break;
        }
      });

      const idPorNombre = new Map(
        nuevosAgentes.map((a) => [`${a.nombre} ${a.apellido}`, a.id])
      );

      const filasComoIds = filasMatrizPorNombre.map((fila) =>
        fila.map((nombre) => (nombre ? idPorNombre.get(nombre) ?? null : null))
      );

      const matrizVacia = crearMatrizVacia(BOOTH_CATALOG[sectorImportado] || filasComoIds.length, 10);
      filasComoIds.forEach((fila, i) => {
        if (matrizVacia[i]) matrizVacia[i] = fila;
      });

      setImportedData({
        nuevosAgentes,
        nuevaMatrizEntrada: sectorImportado === 'entrada' ? matrizVacia : matrizEntrada,
        nuevaMatrizSalida: sectorImportado === 'salida' ? matrizVacia : matrizSalida,
        selectedSector: sectorImportado,
        selectedShift: turnoImportado,
      });
    };

    reader.readAsText(file);
  };

  const generarTextoHorario = () => {
    if (selectedHorarioCasilla === null) return;
    let texto = '';
    if (selectedHorarioCasilla === -1) {
      texto += `-- Equipos --\n`;
      EQUIPOS.forEach((equipo) => {
        texto += `${equipo}:\n`;
        agentes
          .filter((a) => a.sector === equipo && !idsEnCasillaAhora.has(a.id))
          .forEach((a) => {
            texto += ` - ${a.nombre} ${a.apellido}\n`;
          });
      });
      texto += `Casilla:\n`;
      agentes
        .filter((a) => idsEnCasillaAhora.has(a.id))
        .forEach((a) => {
          texto += ` - ${a.nombre} ${a.apellido}\n`;
        });
    } else {
      texto += `Horario: ${horarios[selectedHorarioCasilla]}\n`;
      matrizActual.forEach((fila, indexFila) => {
        if (fila[selectedHorarioCasilla]) {
          const agente = agentePorId(fila[selectedHorarioCasilla]);
          texto += `${encabezadosFilas[indexFila]}: ${agente ? nombreCompleto(agente) : '?'}\n`;
        }
      });
    }
    setHorarioTexto(texto.trim());
  };

  const eliminarTextoHorario = () => setHorarioTexto('');

  const agregarAgente = () => {
    if (nuevoNombre.trim() !== '' && nuevoApellido.trim() !== '') {
      const color = colors[agentes.length % colors.length];
      const nuevoAgente = {
        id: uuidv4(),
        nombre: nuevoNombre,
        apellido: nuevoApellido,
        horas: 0,
        color,
        sector: nuevoSector,
      };
      setAgentes([...agentes, nuevoAgente]);
      setNuevoNombre('');
      setNuevoApellido('');
    }
  };

  const eliminarAgente = (id) => {
    setAgentes(agentes.filter((a) => a.id !== id));
    setMatrizEntrada(matrizEntrada.map((fila) => fila.map((c) => (c === id ? null : c))));
    setMatrizSalida(matrizSalida.map((fila) => fila.map((c) => (c === id ? null : c))));
  };

  const manejarDragStart = (e, agenteId, fila, columna) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ agenteId, fila, columna }));
  };

  const manejarDragOver = (e) => e.preventDefault();

  const manejarDropEquipo = (e, nuevoSector) => {
    e.preventDefault();
    const { agenteId } = JSON.parse(e.dataTransfer.getData('text'));
    setAgentes(agentes.map((a) => (a.id === agenteId ? { ...a, sector: nuevoSector } : a)));
  };

  // Un agente ocupa como mucho una casilla a la vez: se chequean AMBOS
  // sectores, no solo el que está en pantalla.
  const agenteYaEnColumna = (columna, agenteId, filaExcluida) => {
    const enEntrada = matrizEntrada.some(
      (row, idx) => !(selectedSector === 'entrada' && idx === filaExcluida) && row[columna] === agenteId
    );
    const enSalida = matrizSalida.some(
      (row, idx) => !(selectedSector === 'salida' && idx === filaExcluida) && row[columna] === agenteId
    );
    return enEntrada || enSalida;
  };

  const verificarHorasConsecutivas = (matriz, columna, agenteId) => {
    let horasConsecutivas = 1;
    for (let i = columna - 1; i >= 0; i--) {
      if (matriz.some((row) => row[i] === agenteId)) horasConsecutivas++;
      else break;
    }
    for (let i = columna + 1; i < matriz[0].length; i++) {
      if (matriz.some((row) => row[i] === agenteId)) horasConsecutivas++;
      else break;
    }
    return horasConsecutivas >= 3;
  };

  // Click en el chip de Casilla: suma la hora siguiente al agente en
  // función, en la misma casilla donde ya está. Busca la primera
  // columna libre después de su racha actual (no asume ciegamente
  // "columna en vivo + 1"), para que funcione también si ya extendió
  // una vez y ahora quiere sumar una tercera.
  const extenderCasilla = (agenteId) => {
    if (columnaEnVivo === null) return;

    let matriz = matrizEntrada;
    let setMatriz = setMatrizEntrada;
    let fila = matriz.findIndex((row) => row[columnaEnVivo] === agenteId);

    if (fila === -1) {
      matriz = matrizSalida;
      setMatriz = setMatrizSalida;
      fila = matriz.findIndex((row) => row[columnaEnVivo] === agenteId);
    }

    if (fila === -1) return;

    let siguienteColumna = columnaEnVivo;
    while (matriz[fila][siguienteColumna] === agenteId) siguienteColumna++;

    if (siguienteColumna >= horarios.length) {
      alert('Ya es la última hora del turno.');
      return;
    }
    if (matriz[fila][siguienteColumna] !== null || agenteYaEnColumna(siguienteColumna, agenteId, null)) {
      alert('La hora siguiente ya está ocupada.');
      return;
    }

    const aplicar = () => {
      const nuevaMatriz = matriz.map((row) => [...row]);
      nuevaMatriz[fila][siguienteColumna] = agenteId;
      setMatriz(nuevaMatriz);
    };

    if (verificarHorasConsecutivas(matriz, siguienteColumna, agenteId)) {
      setConfirmationModal({ show: true, action: aplicar });
    } else {
      aplicar();
    }
  };

  const manejarDrop = (e, fila, columna) => {
    e.preventDefault();
    const { agenteId, fila: filaOrigen, columna: columnaOrigen } = JSON.parse(
      e.dataTransfer.getData('text')
    );

    const nuevaMatriz = matrizActual.map((row) => [...row]);

    if (filaOrigen !== undefined && columnaOrigen !== undefined) {
      // Movimiento dentro de la matriz.
      if (columna === columnaOrigen) {
        nuevaMatriz[filaOrigen][columnaOrigen] = null;
        nuevaMatriz[fila][columna] = agenteId;
        setMatrizActual(nuevaMatriz);
      } else if (!nuevaMatriz[fila][columna]) {
        if (agenteYaEnColumna(columna, agenteId, filaOrigen)) {
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
      // Nueva asignación desde el panel de equipos.
      if (agenteYaEnColumna(columna, agenteId, null)) {
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
        alert(`La posición (${fila + 1}, ${columna + 1}) ya está ocupada.`);
      }
    }
  };

  const manejarClickFicha = (fila, columna) => {
    const nuevaMatriz = matrizActual.map((row) => [...row]);
    if (nuevaMatriz[fila][columna] !== null) {
      nuevaMatriz[fila][columna] = null;
      setMatrizActual(nuevaMatriz);
    }
  };

  const ordenarAgentesPorEquipo = () => {
    let ordenados = agentes.filter((a) => !idsEnCasillaAhora.has(a.id));

    if (ordenamiento === 'alfabetico') {
      ordenados = [...ordenados].sort((a, b) =>
        `${a.apellido} ${a.nombre}`.toLowerCase().localeCompare(`${b.apellido} ${b.nombre}`.toLowerCase())
      );
    } else {
      ordenados = [...ordenados].sort(
        (a, b) => (horasPorAgente.get(b.id) || 0) - (horasPorAgente.get(a.id) || 0)
      );
    }

    return EQUIPOS.map((equipo) => ({
      equipo,
      agentes: ordenados.filter((a) => a.sector === equipo),
    }));
  };

  const agentesEnCasillaAhora = agentes.filter((a) => idsEnCasillaAhora.has(a.id));

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

      <div className="mb-4 flex space-x-4">
        <select value={selectedShift} onChange={(e) => setSelectedShift(e.target.value)} className="border p-2">
          <option value="mañana">Mañana</option>
          <option value="tarde">Tarde</option>
          <option value="noche">Noche</option>
        </select>
        <select value={selectedSector} onChange={(e) => setSelectedSector(e.target.value)} className="border p-2">
          <option value="entrada">Entrada</option>
          <option value="salida">Salida</option>
        </select>
      </div>

      <div className="mb-4">
        <h2 className="text-xl font-bold mb-2">Registrar Agentes</h2>
        <div className="flex items-center mb-2">
          <input
            type="text"
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            className="border p-2 mr-2"
            placeholder="Nombre"
          />
          <input
            type="text"
            value={nuevoApellido}
            onChange={(e) => setNuevoApellido(e.target.value)}
            className="border p-2 mr-2"
            placeholder="Apellido"
          />
          <select value={nuevoSector} onChange={(e) => setNuevoSector(e.target.value)} className="border p-2 mr-2">
            {EQUIPOS.map((equipo) => (
              <option key={equipo} value={equipo}>{equipo}</option>
            ))}
          </select>
          <button onClick={agregarAgente} className="bg-blue-500 text-white p-2 rounded">
            <Plus size={20} />
          </button>
        </div>

        <div className="mt-4 mb-4">
          <button
            onClick={exportarCSV}
            className="bg-green-500 text-white p-2 rounded shadow transition-transform transform hover:scale-105 hover:shadow-lg"
          >
            Exportar a CSV
          </button>
          <input type="file" accept=".csv" onChange={importarCSV} className="p-2 border" />
          <Link
            to="/estadisticas"
            className="bg-purple-500 text-white p-2 w-44 rounded mr-2 flex items-center shadow transition-transform transform hover:scale-105 hover:shadow-lg"
          >
            <BarChart2 size={20} className="mr-2" />
            Ver Estadísticas
          </Link>
        </div>

        <div className="flex items-center mb-2">
          <button
            onClick={() => setOrdenamiento(ordenamiento === 'alfabetico' ? 'horas' : 'alfabetico')}
            className="bg-gray-300 text-gray-700 p-2 rounded flex items-center shadow transition-transform transform hover:scale-105 hover:shadow-lg"
          >
            <ArrowUpDown size={20} className="mr-2" />
            {ordenamiento === 'alfabetico' ? 'Ordenado alfabeticamente' : 'Ordenado por carga horaria'}
          </button>
        </div>

        <div className="flex space-x-4">
          {ordenarAgentesPorEquipo().map(({ equipo, agentes: agentesDelEquipo }) => (
            <div
              key={equipo}
              className="flex-1 bg-white p-4 rounded shadow"
              onDragOver={manejarDragOver}
              onDrop={(e) => manejarDropEquipo(e, equipo)}
            >
              <h3 className="text-lg font-semibold mb-2 capitalize">{equipo}</h3>
              <div className="flex flex-col gap-2">
                {agentesDelEquipo.map((agente) => (
                  <div
                    key={agente.id}
                    className={`${agente.color} p-2 rounded flex items-center text-white cursor-pointer shadow transition-transform transform hover:scale-105 hover:shadow-lg`}
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

          {/* Panel de Casilla: calculado en vivo según la hora actual y
              la grilla. Click para sumarle la hora siguiente al mismo
              agente sin sacarlo primero — no es arrastrable a propósito,
              para no confundir "sumar hora" con "cambiar de equipo" o
              "mover de casilla". No muestra horas: mientras está en
              función no aporta a la lectura de "cuánto lleva acumulado
              fuera de casilla". */}
          <div className="flex-1 bg-white p-4 rounded shadow opacity-90">
            <h3 className="text-lg font-semibold mb-2">
              Casilla {columnaEnVivo !== null ? `(${horarios[columnaEnVivo]})` : '(fuera de este turno)'}
            </h3>
            <div className="flex flex-col gap-2">
              {agentesEnCasillaAhora.map((agente) => (
                <div
                  key={agente.id}
                  className={`${agente.color} p-2 rounded text-white shadow cursor-pointer`}
                  onClick={() => extenderCasilla(agente.id)}
                  title="Click para sumarle la hora siguiente"
                >
                  {agente.apellido}, {agente.nombre}
                </div>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={limpiarLocalStorage}
          className="bg-red-500 text-white p-2 rounded ml-2 shadow transition-transform transform hover:scale-105 hover:shadow-lg"
        >
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
          {horarios.map((horario, index) => (
            <option key={index} value={index}>{horario}</option>
          ))}
          <option value={-1}>Equipos</option>
        </select>
        <button
          onClick={generarTextoHorario}
          className="bg-blue-500 text-white p-2 rounded ml-2 cursor-pointer shadow transition-transform transform hover:scale-105 hover:shadow-lg"
          disabled={selectedHorarioCasilla === null}
        >
          Generar Texto
        </button>
      </div>

      {horarioTexto && (
        <div className="mt-4 bg-white p-4 rounded shadow">
          <h3 className="text-lg font-semibold mb-2">Texto Generado</h3>
          <pre className="whitespace-pre-wrap">{horarioTexto}</pre>
          <button onClick={eliminarTextoHorario} className="bg-red-500 text-white p-2 rounded mt-2 shadow transition-transform transform hover:scale-105 hover:shadow-lg">
            Eliminar Texto
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full bg-white shadow-md rounded">
          <thead>
            <tr>
              <th className="border p-2 w-32">{SECTOR_LABEL[selectedSector]}</th>
              {horarios.map((horario, index) => (
                <th
                  key={index}
                  className={`border p-2 ${index === columnaEnVivo ? 'bg-yellow-100' : ''}`}
                >
                  {horario}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrizActual.map((fila, filaIndex) => (
              <tr key={filaIndex}>
                <td className="border p-2 w-32 font-bold">{encabezadosFilas[filaIndex]}</td>
                {fila.map((celda, columnaIndex) => {
                  const agente = celda ? agentePorId(celda) : null;
                  return (
                    <td
                      key={columnaIndex}
                      className={`border p-2 w-24 h-12 ${columnaIndex === columnaEnVivo ? 'bg-yellow-50' : ''}`}
                      onDragOver={manejarDragOver}
                      onDrop={(e) => manejarDrop(e, filaIndex, columnaIndex)}
                      onClick={() => manejarClickFicha(filaIndex, columnaIndex)}
                    >
                      {agente && (
                        <div
                          className={`w-full h-full flex items-center justify-center ${agente.color} text-white rounded cursor-pointer shadow transition-transform transform hover:scale-105 hover:shadow-lg`}
                          draggable
                          onDragStart={(e) => manejarDragStart(e, agente.id, filaIndex, columnaIndex)}
                        >
                          {agente.apellido}
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
      </Routes>
    </Router>
  );
};

export default App;
