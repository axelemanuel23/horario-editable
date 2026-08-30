import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Papa from 'papaparse';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ArrowLeft } from 'lucide-react';

// =========================================================
// AGRUPAMIENTO
//
// Cada CSV exportado por HorarioEditable trae una fila 'paso' (id,
// nombre) y una fila 'encabezado' (nombre de vista + nombres de
// casilla). El grupo de estadísticas se arma como "Paso · Vista", o
// solo "Paso" si la vista no tiene nombre (pasos de una sola vista,
// como San Antonio). Ya no se asume Entrada/Salida fijos — el grupo
// sale directamente de lo que diga cada archivo.
// =========================================================

function armarClaveGrupo(pasoNombre, vistaNombre) {
  if (!pasoNombre) return vistaNombre || 'Sin paso';
  return vistaNombre ? `${pasoNombre} · ${vistaNombre}` : pasoNombre;
}

const EstadisticasCasillas = () => {
  const [estadisticas, setEstadisticas] = useState({}); // { grupoKey: { agenteNombre: { casillaNombre: count } } }
  const [casillasValidas, setCasillasValidas] = useState({}); // { grupoKey: [casillaNombre, ...] }
  const [agenteSeleccionado, setAgenteSeleccionado] = useState('');
  const navigate = useNavigate();

  const procesarArchivos = (archivos) => {
    let estadisticasTemp = {};
    let casillasValidasTemp = {};

    const limpiarNombre = (n) => (n || '').trim();

    const procesarArchivo = (index) => {
      if (index >= archivos.length) {
        // Filtra entradas vacías/basura que puedan haber quedado de
        // celdas sin agente o nombres corruptos.
        Object.keys(estadisticasTemp).forEach((grupo) => {
          estadisticasTemp[grupo] = Object.fromEntries(
            Object.entries(estadisticasTemp[grupo]).filter(
              ([agente]) => agente && !/undefined/i.test(agente)
            )
          );
        });

        setEstadisticas(estadisticasTemp);
        setCasillasValidas(casillasValidasTemp);
        return;
      }

      const archivo = archivos[index];

      Papa.parse(archivo, {
        complete: (result) => {
          const datos = result.data;

          const filaPaso = datos.find((fila) => fila[0] === 'paso');
          const pasoNombre = filaPaso ? limpiarNombre(filaPaso[2]) : '';

          const filaEncabezado = datos.find((fila) => fila[0] === 'encabezado');
          if (!filaEncabezado) {
            procesarArchivo(index + 1);
            return;
          }
          const vistaNombre = limpiarNombre(filaEncabezado[1]);
          const casillaNombres = filaEncabezado.slice(2);

          const grupoKey = armarClaveGrupo(pasoNombre, vistaNombre);

          if (!estadisticasTemp[grupoKey]) estadisticasTemp[grupoKey] = {};
          if (!casillasValidasTemp[grupoKey]) casillasValidasTemp[grupoKey] = [];

          const matrizIndex = datos.findIndex((fila) => fila[0] === 'matriz');
          const matriz = datos.slice(matrizIndex).filter((fila) => fila[0] === 'matriz').map((fila) => fila.slice(2));

          matriz.forEach((fila, filaIndex) => {
            const casilla = limpiarNombre(casillaNombres[filaIndex]);
            if (!casilla) return;

            if (!casillasValidasTemp[grupoKey].includes(casilla)) {
              casillasValidasTemp[grupoKey].push(casilla);
            }

            fila.forEach((celda) => {
              const nombreCompleto = limpiarNombre(celda);
              if (!nombreCompleto || nombreCompleto === 'undefined undefined') return;

              if (!estadisticasTemp[grupoKey][nombreCompleto]) {
                estadisticasTemp[grupoKey][nombreCompleto] = {};
              }
              if (!estadisticasTemp[grupoKey][nombreCompleto][casilla]) {
                estadisticasTemp[grupoKey][nombreCompleto][casilla] = 0;
              }
              estadisticasTemp[grupoKey][nombreCompleto][casilla]++;
            });
          });

          procesarArchivo(index + 1);
        },
      });
    };

    procesarArchivo(0);
  };

  const handleFileUpload = (event) => {
    const archivos = Array.from(event.target.files);
    procesarArchivos(archivos);
  };

  const prepararDatosGrafico = (grupoKey) => {
    if (!agenteSeleccionado) return [];
    const agenteData = estadisticas[grupoKey]?.[agenteSeleccionado] || {};

    return [
      {
        nombre: agenteSeleccionado,
        ...Object.fromEntries(
          Object.entries(agenteData).filter(
            ([casilla, valor]) => casillasValidas[grupoKey]?.includes(casilla) && valor !== null && valor !== undefined
          )
        ),
      },
    ];
  };

  const agentesDisponibles = Object.assign({}, ...Object.values(estadisticas));

  return (
    <div className="p-4 bg-gray-100 min-h-screen">
      <button onClick={() => navigate('/')} className="mb-4 flex items-center text-blue-500 hover:text-blue-700">
        <ArrowLeft size={20} className="mr-2" />
        Volver al horario
      </button>

      <h1 className="text-2xl font-bold mb-4">Estadísticas de Casillas por Agente</h1>

      <input type="file" onChange={handleFileUpload} multiple accept=".csv" className="mb-4 p-2 border rounded" />

      <select
        value={agenteSeleccionado}
        onChange={(e) => setAgenteSeleccionado(e.target.value)}
        className="mb-4 p-2 border rounded"
      >
        <option value="">Selecciona un agente</option>
        {Object.keys(agentesDisponibles).map((agente) => (
          <option key={agente} value={agente}>{agente}</option>
        ))}
      </select>

      {agenteSeleccionado && (
        <div className="mt-4 space-y-8">
          {Object.keys(estadisticas).map((grupoKey) => {
            if (!estadisticas[grupoKey][agenteSeleccionado]) return null;
            return (
              <div key={grupoKey}>
                <h2 className="text-xl font-semibold mb-2">{grupoKey}</h2>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={prepararDatosGrafico(grupoKey)}>
                    <XAxis dataKey="nombre" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    {casillasValidas[grupoKey].map((casilla, index) => (
                      <Bar key={casilla} dataKey={casilla} fill={`hsl(${index * 30}, 70%, 50%)`} name={casilla} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default EstadisticasCasillas;
