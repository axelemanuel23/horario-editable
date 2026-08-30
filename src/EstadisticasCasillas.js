import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Papa from 'papaparse';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ArrowLeft } from 'lucide-react';

const EstadisticasCasillas = () => {
  const [estadisticas, setEstadisticas] = useState({ entrada: {}, salida: {} });
  const [casillasValidas, setCasillasValidas] = useState({ entrada: [], salida: [] });
  const [agenteSeleccionado, setAgenteSeleccionado] = useState('');
  const navigate = useNavigate();

  //Funcion recursiva
  const procesarArchivos = (archivos) => {
    let estadisticasTemp = { entrada: {}, salida: {} };
    let casillasValidasTemp = { entrada: [], salida: [] };

    const procesarArchivo = (index) => {
      if (index >= archivos.length) {
        // Filter and clean up statistics
        ['entrada', 'salida'].forEach(sector => {
          estadisticasTemp[sector] = Object.fromEntries(
            Object.entries(estadisticasTemp[sector]).filter(([agente, casillas]) =>
              !/undefined/i.test(agente) && agente.trim() !== ""
            )
          );

          Object.keys(estadisticasTemp[sector]).forEach(agente => {
            estadisticasTemp[sector][agente] = Object.fromEntries(
              Object.entries(estadisticasTemp[sector][agente]).filter(([casilla, valor]) => 
                valor !== null && valor !== undefined && casilla !== 'undefined' && casilla.trim() !== ""
              )
            );
          });

          casillasValidasTemp[sector] = [...new Set(
            Object.values(estadisticasTemp[sector]).flatMap(Object.keys)
          )].filter(casilla => casilla !== 'undefined' && casilla.trim() !== "");
        });

        setEstadisticas(estadisticasTemp);
        setCasillasValidas(casillasValidasTemp);
        return;
      }

      const archivo = archivos[index];

      Papa.parse(archivo, {
        complete: (result) => {
          const datos = result.data;
          const matrizIndex = datos.findIndex(fila => fila[0] === 'matriz');
          const encabezados = datos.find(fila => fila[0] === 'encabezado').slice(1);
          const matriz = datos.slice(matrizIndex).map(fila => fila.slice(1));
          const sector = encabezados[0].toLowerCase().includes('entrada') ? 'entrada' : 'salida';

          matriz.forEach((fila, filaIndex) => {
            const casilla = encabezados[filaIndex];
            if (casilla && casilla.trim() !== '') {
              if (!casillasValidasTemp[sector].includes(casilla)) {
                casillasValidasTemp[sector].push(casilla);
              }
              
              fila.forEach((celda) => {
                if (celda && celda.trim() !== '') {
                  const [nombre, apellido] = celda.split(' ');
                  const nombreCompleto = `${nombre} ${apellido}`.trim();
                  
                  if (nombreCompleto !== '' && nombreCompleto !== 'undefined undefined') {
                    if (!estadisticasTemp[sector][nombreCompleto]) {
                      estadisticasTemp[sector][nombreCompleto] = {};
                    }
                    if (!estadisticasTemp[sector][nombreCompleto][casilla]) {
                      estadisticasTemp[sector][nombreCompleto][casilla] = 0;
                    }
                    estadisticasTemp[sector][nombreCompleto][casilla]++;
                  }
                }
              });
            }
          });

          procesarArchivo(index + 1);
        }
      });
    };

    procesarArchivo(0);
  };

  const handleFileUpload = (event) => {
    const archivos = Array.from(event.target.files);
    procesarArchivos(archivos);
  };

  const prepararDatosGrafico = (sector) => {
    if (!agenteSeleccionado) {
      return [];
    }
    
    const agenteData = estadisticas[sector][agenteSeleccionado] || {};
    
    return [{
      nombre: agenteSeleccionado,
      ...Object.fromEntries(
        Object.entries(agenteData).filter(([casilla, valor]) =>
          casillasValidas[sector].includes(casilla) && valor !== null && valor !== undefined
        )
      )
    }];
  };

  
  // Función para generar la etiqueta de la casilla
  const generarEtiquetaCasilla = (casilla, index) => `Casilla ${index + 1}`;

  return (
    <div className="p-4 bg-gray-100 min-h-screen">
      <button
        onClick={() => navigate('/')}
        className="mb-4 flex items-center text-blue-500 hover:text-blue-700"
      >
        <ArrowLeft size={20} className="mr-2" />
        Volver al horario
      </button>

      <h1 className="text-2xl font-bold mb-4">Estadísticas de Casillas por Agente</h1>

      <input
        type="file"
        onChange={handleFileUpload}
        multiple
        accept=".csv"
        className="mb-4 p-2 border rounded"
      />

      <select
        value={agenteSeleccionado}
        onChange={(e) => setAgenteSeleccionado(e.target.value)}
        className="mb-4 p-2 border rounded"
      >
        <option value="">Selecciona un agente</option>
        {Object.keys({...estadisticas.entrada, ...estadisticas.salida}).map((agente) => (
          <option key={agente} value={agente}>
            {agente}
          </option>
        ))}
      </select> 
      {agenteSeleccionado && (
        <div className="mt-4 space-y-8">
          {['entrada', 'salida'].map(sector => (
            <div key={sector}>
              <h2 className="text-xl font-semibold mb-2 capitalize">{sector}</h2>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={prepararDatosGrafico(sector)}>
                  <XAxis dataKey="nombre" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  {casillasValidas[sector].map((casilla, index) => (
                    <Bar 
                      key={casilla} 
                      dataKey={casilla} 
                      fill={`hsl(${index * 30}, 70%, 50%)`}
                      name={generarEtiquetaCasilla(casilla, index)}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default EstadisticasCasillas;
