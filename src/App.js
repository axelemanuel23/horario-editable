import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Link, useNavigate } from 'react-router-dom';
import { Plus, Trash2, ArrowUpDown, BarChart2, Upload, Download } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import EstadisticasCasillas from './EstadisticasCasillas';
import { cargarEstadoInicial, guardarEstado, limpiarEstado } from './utils/storage';
import { exportarCSV, importarCSV } from './utils/csvHandler';

const colors = [
  'bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500',
  'bg-pink-500', 'bg-indigo-500', 'bg-teal-500', 'bg-orange-500', 'bg-cyan-500',
  'bg-lime-500', 'bg-amber-500', 'bg-emerald-500', 'bg-fuchsia-500', 'bg-rose-500'
];

const equipos = ['Micro', 'Corredor'];

const HorarioEditable = () => {
  // Estado principal
  const [estado, setEstado] = useState(() => {
    const inicial = cargarEstadoInicial();
    return inicial || {
      agentes: [],
      matrices: {
        entrada: Array(16).fill().map(() => Array(10).fill(null)),
        salida: Array(11).fill().map(() => Array(10).fill(null))
      },
      config: {
        horarios: ['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00'],
        casillas: {
          entrada: Array(16).fill().map((_, i) => `Entrada ${i + 1}`),
          salida: Array(11).fill().map((_, i) => `Salida ${i + 1}`)
        }
      },
      historial: []
    };
  });

  // Estado UI
  const [selectedShift, setSelectedShift] = useState('mañana');
  const [selectedSector, setSelectedSector] = useState('entrada');
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoApellido, setNuevoApellido] = useState('');
  const [nuevoEquipo, setNuevoEquipo] = useState('Micro');
  const [ordenamiento, setOrdenamiento] = useState('alfabetico');
  const [confirmationModal, setConfirmationModal] = useState({ show: false, action: null });
  const [selectedHorarioCasilla, setSelectedHorarioCasilla] = useState(null);
  const [horarioTexto, setHorarioTexto] = useState('');
  const [ultimoRefresh, setUltimoRefresh] = useState(() => new Date().toISOString());
  const [fotoAnterior, setFotoAnterior] = useState(null);
  const navigate = useNavigate();

  // Configuración de turnos
  const turnosConfig = {
    mañana: ['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00'],
    tarde: ['15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00', '00:00'],
    noche: ['21:00', '22:00', '23:00', '00:00', '01:00', '02:00', '03:00', '04:00', '05:00', '06:00']
  };

  // Guardar estado en localStorage
  useEffect(() => {
    guardarEstado(estado);
  }, [estado]);

  // Actualizar horarios al cambiar turno
 // Reemplazar el useEffect de turnos (línea ~73)
useEffect(() => {
  const turnosConfig = {
    mañana: ['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00'],
    tarde: ['15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00', '00:00'],
    noche: ['21:00', '22:00', '23:00', '00:00', '01:00', '02:00', '03:00', '04:00', '05:00', '06:00']
  };
  
  setEstado(prev => ({
    ...prev,
    config: {
      ...prev.config,
      horarios: turnosConfig[selectedShift]
    }
  }));
}, [selectedShift]);

  // Timer para refresh horario
  useEffect(() => {
    const verificarRefresh = () => {
      const ahora = new Date();
      const horaActual = ahora.getHours();
      const minutos = ahora.getMinutes();
      
      // Refresh en la hora exacta (cuando minutos = 0)
      if (minutos === 0 || minutos === 1) {
        const ultimoCheck = new Date(ultimoRefresh);
        if (ahora.getTime() - ultimoCheck.getTime() > 30 * 60 * 1000) { // Al menos 30 min desde último check
          ejecutarRefreshHorario();
          setUltimoRefresh(ahora.toISOString());
        }
      }
    };
    
    const interval = setInterval(verificarRefresh, 60000); // Check cada minuto
    return () => clearInterval(interval);
  }, [ultimoRefresh, estado]);

  const ejecutarRefreshHorario = useCallback(() => {
     const columnaActual = estado.config.horarios.findIndex(h => parseInt(h) === new Date().getHours());
    
    if (columnaActual === -1) return;
    
    const matrizActual = estado.matrices[selectedSector];
    
    if (!fotoAnterior) {
      // Primera foto, no hay nada que comparar
      setFotoAnterior(matrizActual.map(fila => [...fila]));
      return;
    }
    
    // Comparar foto anterior con estado actual
    const cambios = [];
    matrizActual.forEach((fila, filaIndex) => {
      fila.forEach((celda, colIndex) => {
        if (colIndex === columnaActual && celda !== fotoAnterior[filaIndex][colIndex]) {
          cambios.push({
            fila: filaIndex,
            columna: colIndex,
            agenteAnterior: fotoAnterior[filaIndex][colIndex],
            agenteNuevo: celda
          });
        }
      });
    });
    
    // Procesar cambios
    cambios.forEach(cambio => {
      if (cambio.agenteAnterior && cambio.agenteNuevo) {
        // Hay relevo - intercambiar equipos
        intercambiarEquipos(cambio.agenteAnterior, cambio.agenteNuevo);
        registrarHistorial('relevo', cambio);
      } else if (cambio.agenteAnterior && !cambio.agenteNuevo) {
        // Casilla vaciada - retornar al equipo anterior
        retornarAEquipoAnterior(cambio.agenteAnterior);
        registrarHistorial('cierre', cambio);
      } else if (!cambio.agenteAnterior && cambio.agenteNuevo) {
        // Nueva asignación
        registrarHistorial('apertura', cambio);
      }
    });
    
    // Actualizar foto
    setFotoAnterior(matrizActual.map(fila => [...fila]));
  };[estado, selectedSector, fotoAnterior]);

  useEffect(() => {
  const verificarRefresh = () => {
    const ahora = new Date();
    const minutos = ahora.getMinutes();
    
    if (minutos === 0 || minutos === 1) {
      const ultimoCheck = new Date(ultimoRefresh);
      if (ahora.getTime() - ultimoCheck.getTime() > 30 * 60 * 1000) {
        ejecutarRefreshHorario();
        setUltimoRefresh(ahora.toISOString());
      }
    }
  };
  
  const interval = setInterval(verificarRefresh, 60000);
  return () => clearInterval(interval);
}, [ultimoRefresh, ejecutarRefreshHorario]);
  
  const intercambiarEquipos = (agenteSalienteId, agenteEntranteId) => {
    setEstado(prev => {
      const nuevosAgentes = prev.agentes.map(agente => {
        if (agente.id === agenteSalienteId) {
          const agenteEntrante = prev.agentes.find(a => a.id === agenteEntranteId);
          return { ...agente, equipo: agenteEntrante.equipo };
        }
        return agente;
      });
      
      return { ...prev, agentes: nuevosAgentes };
    });
  };

  const retornarAEquipoAnterior = (agenteId) => {
    setEstado(prev => {
      const nuevosAgentes = prev.agentes.map(agente => {
        if (agente.id === agenteId) {
          return { ...agente, equipo: agente.equipoOriginal };
        }
        return agente;
      });
      
      return { ...prev, agentes: nuevosAgentes };
    });
  };

  const registrarHistorial = (tipo, datos) => {
  const ahora = new Date();
  const registro = {
    timestamp: ahora.toISOString(),
    tipo,
    sector: selectedSector, // Añadir el sector actual
    ...datos
  };
  
  setEstado(prev => ({
    ...prev,
    historial: [...prev.historial, registro]
  }));
};

  const agregarAgente = () => {
    if (nuevoNombre.trim() !== '' && nuevoApellido.trim() !== '') {
      const nuevoAgente = {
        id: uuidv4(),
        nombre: nuevoNombre.trim(),
        apellido: nuevoApellido.trim(),
        equipo: nuevoEquipo,
        equipoOriginal: nuevoEquipo,
        color: colors[estado.agentes.length % colors.length],
        horas: 0
      };
      
      setEstado(prev => ({
        ...prev,
        agentes: [...prev.agentes, nuevoAgente]
      }));
      
      setNuevoNombre('');
      setNuevoApellido('');
    }
  };

  const eliminarAgente = (id) => {
    setEstado(prev => {
      // Eliminar de matrices
      const nuevasMatrices = {
        entrada: prev.matrices.entrada.map(fila => 
          fila.map(celda => celda === id ? null : celda)
        ),
        salida: prev.matrices.salida.map(fila => 
          fila.map(celda => celda === id ? null : celda)
        )
      };
      
      return {
        ...prev,
        agentes: prev.agentes.filter(a => a.id !== id),
        matrices: nuevasMatrices
      };
    });
  };

  const manejarDragStart = (e, agenteId) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ agenteId }));
  };

  const manejarDragOver = (e) => {
    e.preventDefault();
  };

  // Reemplazar la lógica de actualización de horas
const manejarDrop = (e, fila, columna) => {
  e.preventDefault();
  const data = JSON.parse(e.dataTransfer.getData('text'));
  const agenteId = data.agenteId;
  
  const agente = estado.agentes.find(a => a.id === agenteId);
  if (!agente) return;
  
  setEstado(prev => {
    // Encontrar si el agente estaba en otra celda
    let agenteMovido = false;
    const nuevasMatrices = {
      ...prev.matrices,
      [selectedSector]: prev.matrices[selectedSector].map((row, rowIndex) =>
        row.map((celda, colIndex) => {
          if (rowIndex === fila && colIndex === columna) {
            return agenteId;
          }
          // Si encontramos al agente en otra celda, la limpiamos
          if (celda === agenteId) {
            agenteMovido = true;
            return null;
          }
          return celda;
        })
      )
    };
    
    // Actualizar horas
    const nuevosAgentes = prev.agentes.map(a => {
      if (a.id === agenteId) {
        return { ...a, horas: a.horas + 1 };
      }
      return a;
    });
    
    return {
      ...prev,
      matrices: nuevasMatrices,
      agentes: nuevosAgentes
    };
  });
};

  const manejarClickFicha = (fila, columna) => {
    const agenteId = estado.matrices[selectedSector][fila][columna];
    if (!agenteId) return;
    
    setEstado(prev => {
      const nuevasMatrices = {
        ...prev.matrices,
        [selectedSector]: prev.matrices[selectedSector].map((row, rowIndex) =>
          row.map((celda, colIndex) => {
            if (rowIndex === fila && colIndex === columna) {
              return null;
            }
            return celda;
          })
        )
      };
      
      const nuevosAgentes = prev.agentes.map(agente => {
        if (agente.id === agenteId) {
          return { ...agente, horas: Math.max(0, agente.horas - 1) };
        }
        return agente;
      });
      
      return {
        ...prev,
        matrices: nuevasMatrices,
        agentes: nuevosAgentes
      };
    });
  };

  const ordenarAgentes = () => {
    let agentesOrdenados = [...estado.agentes];
    
    if (ordenamiento === 'alfabetico') {
      agentesOrdenados.sort((a, b) => {
        const nombreA = `${a.apellido} ${a.nombre}`.toLowerCase();
        const nombreB = `${b.apellido} ${b.nombre}`.toLowerCase();
        return nombreA.localeCompare(nombreB);
      });
    } else {
      agentesOrdenados.sort((a, b) => b.horas - a.horas);
    }
    
    // Agrupar por equipo
    return equipos.map(equipo => ({
      equipo,
      agentes: agentesOrdenados.filter(a => a.equipo === equipo)
    }));
  };

  const generarTextoHorario = () => {
    if (selectedHorarioCasilla === null) return;
    
    let texto = '';
    const matrizActual = estado.matrices[selectedSector];
    
    if (selectedHorarioCasilla === -1) {
      texto += '-- Equipos --\n';
      equipos.forEach(equipo => {
        texto += `${equipo}:\n`;
        estado.agentes
          .filter(a => a.equipo === equipo)
          .forEach(a => {
            texto += ` - ${a.nombre} ${a.apellido}\n`;
          });
      });
    } else {
      texto += `Horario: ${estado.config.horarios[selectedHorarioCasilla]}\n`;
      matrizActual.forEach((fila, filaIndex) => {
        if (fila[selectedHorarioCasilla]) {
          const agente = estado.agentes.find(a => a.id === fila[selectedHorarioCasilla]);
          if (agente) {
            const casilla = estado.config.casillas[selectedSector][filaIndex];
            texto += `${casilla}: ${agente.nombre} ${agente.apellido}\n`;
          }
        }
      });
    }
    
    setHorarioTexto(texto.trim());
  };

  const handleImportar = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    importarCSV(file, (nuevoEstado, turno, sector) => {
      setEstado(nuevoEstado);
      setSelectedShift(turno);
      setSelectedSector(sector);
      setFotoAnterior(null);
    });
  };

  return (
    <div className="p-4 bg-gray-100 min-h-screen">
      {/* Modal de confirmación */}
      {confirmationModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded shadow-lg">
            <p className="mb-4">{confirmationModal.mensaje}</p>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => {
                  confirmationModal.action();
                  setConfirmationModal({ show: false });
                }}
                className="bg-blue-500 text-white px-4 py-2 rounded"
              >
                Confirmar
              </button>
              <button
                onClick={() => setConfirmationModal({ show: false })}
                className="bg-gray-300 px-4 py-2 rounded"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Header con controles */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => navigate('/')}
          className="text-2xl font-bold text-gray-800"
        >
          Gestión de Horarios
        </button>
        
        <div className="flex gap-2 ml-auto">
          <select
            value={selectedShift}
            onChange={(e) => setSelectedShift(e.target.value)}
            className="border p-2 rounded"
          >
            <option value="mañana">Mañana</option>
            <option value="tarde">Tarde</option>
            <option value="noche">Noche</option>
          </select>
          
          <select
            value={selectedSector}
            onChange={(e) => setSelectedSector(e.target.value)}
            className="border p-2 rounded"
          >
            <option value="entrada">Entrada</option>
            <option value="salida">Salida</option>
          </select>
        </div>
      </div>
      
      {/* Sección de agentes */}
      <div className="mb-6 bg-white p-4 rounded shadow">
        <h2 className="text-xl font-bold mb-4">Agentes</h2>
        
        <div className="flex flex-wrap gap-2 mb-4">
          <input
            type="text"
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            className="border p-2 rounded"
            placeholder="Nombre"
          />
          <input
            type="text"
            value={nuevoApellido}
            onChange={(e) => setNuevoApellido(e.target.value)}
            className="border p-2 rounded"
            placeholder="Apellido"
          />
          <select
            value={nuevoEquipo}
            onChange={(e) => setNuevoEquipo(e.target.value)}
            className="border p-2 rounded"
          >
            {equipos.map(equipo => (
              <option key={equipo} value={equipo}>{equipo}</option>
            ))}
          </select>
          <button
            onClick={agregarAgente}
            className="bg-blue-500 text-white p-2 rounded flex items-center"
          >
            <Plus size={20} className="mr-1" />
            Agregar
          </button>
        </div>
        
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => exportarCSV(estado, selectedShift, selectedSector)}
            className="bg-green-500 text-white p-2 rounded flex items-center"
          >
            <Download size={20} className="mr-1" />
            Exportar
          </button>
          <label className="bg-purple-500 text-white p-2 rounded cursor-pointer flex items-center">
            <Upload size={20} className="mr-1" />
            Importar
            <input
              type="file"
              accept=".csv"
              onChange={handleImportar}
              className="hidden"
            />
          </label>
          <button
            onClick={() => setOrdenamiento(ordenamiento === 'alfabetico' ? 'horas' : 'alfabetico')}
            className="bg-gray-500 text-white p-2 rounded flex items-center"
          >
            <ArrowUpDown size={20} className="mr-1" />
            {ordenamiento === 'alfabetico' ? 'Alfabético' : 'Por horas'}
          </button>
          <Link
            to="/estadisticas"
            className="bg-indigo-500 text-white p-2 rounded flex items-center"
          >
            <BarChart2 size={20} className="mr-1" />
            Estadísticas
          </Link>
          <button
            onClick={() => {
              if (window.confirm('¿Está seguro de que desea borrar todos los datos?')) {
                limpiarEstado();
                window.location.reload();
              }
            }}
            className="bg-red-500 text-white p-2 rounded ml-auto"
          >
            <Trash2 size={20} />
          </button>
        </div>
        
        {/* Lista de agentes por equipo */}
        <div className="flex gap-4">
          {ordenarAgentes().map(({ equipo, agentes }) => (
            <div
              key={equipo}
              className="flex-1 bg-gray-50 p-3 rounded"
              onDragOver={manejarDragOver}
            >
              <h3 className="font-semibold mb-2">{equipo}</h3>
              <div className="space-y-2">
                {agentes.map(agente => (
                  <div
                    key={agente.id}
                    draggable
                    onDragStart={(e) => manejarDragStart(e, agente.id)}
                    className={`${agente.color} text-white p-2 rounded flex justify-between items-center cursor-move`}
                  >
                    <span>{agente.apellido}, {agente.nombre} ({agente.horas}h)</span>
                    <button
                      onClick={() => eliminarAgente(agente.id)}
                      className="ml-2 text-white hover:text-red-200"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Generador de texto */}
      <div className="mb-6 bg-white p-4 rounded shadow">
        <h3 className="font-semibold mb-2">Generar Texto</h3>
        <div className="flex gap-2">
          <select
            value={selectedHorarioCasilla || ''}
            onChange={(e) => setSelectedHorarioCasilla(Number(e.target.value))}
            className="border p-2 rounded"
          >
            <option value="" disabled>Seleccionar horario</option>
            {estado.config.horarios.map((horario, index) => (
              <option key={index} value={index}>{horario}</option>
            ))}
            <option value={-1}>Equipos</option>
          </select>
          <button
            onClick={generarTextoHorario}
            className="bg-blue-500 text-white p-2 rounded"
            disabled={selectedHorarioCasilla === null}
          >
            Generar
          </button>
        </div>
        
        {horarioTexto && (
          <div className="mt-4">
            <pre className="whitespace-pre-wrap bg-gray-50 p-3 rounded">{horarioTexto}</pre>
            <button
              onClick={() => setHorarioTexto('')}
              className="mt-2 bg-red-500 text-white px-3 py-1 rounded"
            >
              Limpiar
            </button>
          </div>
        )}
      </div>
      
      {/* Matriz de horarios */}
      <div className="bg-white p-4 rounded shadow overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="border p-2 w-32">
                {selectedSector === 'entrada' ? 'Entradas' : 'Salidas'}
              </th>
              {estado.config.horarios.map((horario, index) => (
                <th key={index} className="border p-2">{horario}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {estado.matrices[selectedSector].map((fila, filaIndex) => (
              <tr key={filaIndex}>
                <td className="border p-2 font-bold">
                  {estado.config.casillas[selectedSector][filaIndex]}
                </td>
                {fila.map((agenteId, colIndex) => {
                  const agente = estado.agentes.find(a => a.id === agenteId);
                  return (
                    <td
                      key={colIndex}
                      className="border p-1"
                      onDragOver={manejarDragOver}
                      onDrop={(e) => manejarDrop(e, filaIndex, colIndex)}
                      onClick={() => manejarClickFicha(filaIndex, colIndex)}
                    >
                      {agente && (
                        <div
                          className={`${agente.color} text-white p-1 rounded text-xs cursor-move`}
                          draggable
                          onDragStart={(e) => {
                            e.stopPropagation();
                            manejarDragStart(e, agente.id);
                          }}
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
