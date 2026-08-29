import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ArrowLeft, TrendingUp, Clock, MapPin } from 'lucide-react';
import { cargarEstadoInicial } from './utils/storage';

const EstadisticasCasillas = () => {
  const [estado, setEstado] = useState(null);
  const [agenteSeleccionado, setAgenteSeleccionado] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const estadoCargado = cargarEstadoInicial();
    if (estadoCargado) {
      setEstado(estadoCargado);
    }
  }, []);

  if (!estado) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-600">No hay datos disponibles. Importa un archivo CSV primero.</p>
        <button
          onClick={() => navigate('/')}
          className="mt-4 bg-blue-500 text-white px-4 py-2 rounded"
        >
          Volver al horario
        </button>
      </div>
    );
  }

  const calcularEstadisticasAgente = (agenteId) => {
    const estadisticas = {
      entrada: {},
      salida: {},
      totalHoras: 0
    };

    ['entrada', 'salida'].forEach(sector => {
      estado.matrices[sector].forEach((fila, filaIndex) => {
        fila.forEach((celdaAgenteId, colIndex) => {
          if (celdaAgenteId === agenteId) {
            const casilla = estado.config.casillas[sector][filaIndex];
            if (!estadisticas[sector][casilla]) {
              estadisticas[sector][casilla] = 0;
            }
            estadisticas[sector][casilla]++;
            estadisticas.totalHoras++;
          }
        });
      });
    });

    return estadisticas;
  };

  const prepararDatosGrafico = (sector) => {
    if (!agenteSeleccionado) return [];
    
    const estadisticas = calcularEstadisticasAgente(agenteSeleccionado);
    const datos = estadisticas[sector];
    
    return Object.entries(datos).map(([casilla, horas]) => ({
      casilla,
      horas
    }));
  };

  const agenteActual = estado.agentes.find(a => a.id === agenteSeleccionado);
  const estadisticasAgente = agenteSeleccionado ? 
    calcularEstadisticasAgente(agenteSeleccionado) : null;

  return (
    <div className="p-4 bg-gray-100 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <button
          onClick={() => navigate('/')}
          className="mb-4 flex items-center text-blue-500 hover:text-blue-700"
        >
          <ArrowLeft size={20} className="mr-2" />
          Volver al horario
        </button>

        <h1 className="text-2xl font-bold mb-6">Estadísticas de Agentes</h1>

        {/* Selector de agente */}
        <div className="bg-white p-4 rounded shadow mb-6">
          <label className="block text-sm font-medium mb-2">
            Seleccionar Agente
          </label>
          <select
            value={agenteSeleccionado}
            onChange={(e) => setAgenteSeleccionado(e.target.value)}
            className="w-full p-2 border rounded"
          >
            <option value="">Selecciona un agente</option>
            {estado.agentes.map(agente => (
              <option key={agente.id} value={agente.id}>
                {agente.apellido}, {agente.nombre} - {agente.equipo}
              </option>
            ))}
          </select>
        </div>

        {agenteSeleccionado && agenteActual && (
          <>
            {/* Resumen general */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-white p-4 rounded shadow">
                <div className="flex items-center">
                  <Clock size={20} className="text-blue-500 mr-2" />
                  <h3 className="font-semibold">Total Horas</h3>
                </div>
                <p className="text-2xl font-bold mt-2">{estadisticasAgente.totalHoras}h</p>
              </div>
              
              <div className="bg-white p-4 rounded shadow">
                <div className="flex items-center">
                  <MapPin size={20} className="text-green-500 mr-2" />
                  <h3 className="font-semibold">Equipo Actual</h3>
                </div>
                <p className="text-2xl font-bold mt-2">{agenteActual.equipo}</p>
              </div>
              
              <div className="bg-white p-4 rounded shadow">
                <div className="flex items-center">
                  <TrendingUp size={20} className="text-purple-500 mr-2" />
                  <h3 className="font-semibold">Promedio Horas/Día</h3>
                </div>
                <p className="text-2xl font-bold mt-2">
                  {(estadisticasAgente.totalHoras / 7).toFixed(1)}h
                </p>
              </div>
            </div>

            {/* Gráficos por sector */}
            <div className="space-y-6">
              {['entrada', 'salida'].map(sector => (
                <div key={sector} className="bg-white p-4 rounded shadow">
                  <h2 className="text-xl font-semibold mb-4 capitalize">
                    {sector === 'entrada' ? 'Entradas' : 'Salidas'}
                  </h2>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={prepararDatosGrafico(sector)}>
                      <XAxis dataKey="casilla" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="horas" fill="#3B82F6" name="Horas" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>
{/* Historial de cambios */}
{estado.historial && estado.historial.length > 0 && (
  <div className="mt-6 bg-white p-4 rounded shadow">
    <h2 className="text-xl font-semibold mb-4">Historial de Cambios</h2>
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {estado.historial
        .filter(h => {
          const agenteAnterior = estado.agentes.find(a => a.id === h.agenteAnterior);
          const agenteNuevo = estado.agentes.find(a => a.id === h.agenteNuevo);
          return agenteAnterior?.id === agenteSeleccionado || 
                 agenteNuevo?.id === agenteSeleccionado;
        })
        .map((historial, index) => {
          const agenteAnterior = estado.agentes.find(a => a.id === historial.agenteAnterior);
          const agenteNuevo = estado.agentes.find(a => a.id === historial.agenteNuevo);
          
          // Determinar el sector basado en el tipo de cambio o buscar en ambas matrices
          let casilla = `Casilla ${historial.fila + 1}`;
          let sector = 'desconocido';
          
          // Buscar el sector correcto
          if (historial.sector) {
            sector = historial.sector;
            casilla = estado.config.casillas[historial.sector]?.[historial.fila] || casilla;
          } else {
            // Intentar determinar el sector basado en el agente
            ['entrada', 'salida'].forEach(sectorName => {
              if (estado.matrices[sectorName]?.[historial.fila]) {
                const tieneAgente = estado.matrices[sectorName][historial.fila].some(
                  id => id === historial.agenteAnterior || id === historial.agenteNuevo
                );
                if (tieneAgente) {
                  sector = sectorName;
                  casilla = estado.config.casillas[sectorName][historial.fila];
                }
              }
            });
          }
          
          return (
            <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
              <div>
                <span className="text-sm font-medium">
                  {new Date(historial.timestamp).toLocaleTimeString()} - {historial.tipo}
                </span>
                <span className="text-sm ml-2 text-gray-600">
                  {sector} - {casilla}
                </span>
              </div>
              <span className="text-sm">
                {agenteAnterior?.apellido || 'Vacía'} → {agenteNuevo?.apellido || 'Vacía'}
              </span>
            </div>
          );
        })}
    </div>
  </div>
)}
          </>
        )}
      </div>
    </div>
  );
};

export default EstadisticasCasillas;
