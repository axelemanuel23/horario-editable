import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ArrowLeft, FileSpreadsheet } from 'lucide-react';

// =========================================================
// FUENTE DE DATOS: cierres de jornada (JSON), ya no CSV.
//
// Cada archivo subido es un snapshot generado por "Cerrar Jornada" en
// HorarioEditable:
// { pasoNombre, fecha, vistas: [{nombre, casillas, matriz}],
//   agentes: [{id, nombre, apellido, ...}], movimientos: [...] }
//
// El grupo de estadísticas se arma como "Paso · Vista" (o solo "Paso"
// si la vista no tiene nombre, para pasos de una sola vista).
// =========================================================

function armarClaveGrupo(pasoNombre, vistaNombre) {
  if (!pasoNombre) return vistaNombre || 'Sin paso';
  return vistaNombre ? `${pasoNombre} · ${vistaNombre}` : pasoNombre;
}

function etiquetaHora(h) {
  return `${String(h).padStart(2, '0')}:00`;
}

function formatearMovimiento(m, fecha) {
  const fechaTxt = new Date(fecha).toLocaleDateString();
  if (m.tipo === 'cambio') {
    return `${fechaTxt} ${etiquetaHora(m.hora)} — ${m.entraNombre} → ${m.saleNombre} (${m.entraNombre} vino por ${m.saleNombre})`;
  }
  if (m.tipo === 'refuerzo') {
    return `${fechaTxt} ${etiquetaHora(m.hora)} — ${m.agenteNombre} — refuerzo`;
  }
  if (m.tipo === 'retiro') {
    return `${fechaTxt} ${etiquetaHora(m.hora)} — ${m.agenteNombre} — se retiró`;
  }
  return '';
}

const EstadisticasCasillas = () => {
  const [cierres, setCierres] = useState([]); // lista de snapshots JSON cargados
  const [estadisticas, setEstadisticas] = useState({});
  const [casillasValidas, setCasillasValidas] = useState({});
  const [agenteSeleccionado, setAgenteSeleccionado] = useState('');
  const navigate = useNavigate();

  const handleFileUpload = (event) => {
    const archivos = Array.from(event.target.files);

    Promise.all(
      archivos.map(
        (file) =>
          new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              try {
                resolve(JSON.parse(e.target.result));
              } catch (err) {
                resolve(null);
              }
            };
            reader.readAsText(file);
          })
      )
    ).then((parseados) => {
      const validos = parseados.filter(Boolean);
      const nuevosCierres = [...cierres, ...validos];
      setCierres(nuevosCierres);

      const estadisticasTemp = {};
      const casillasValidasTemp = {};

      nuevosCierres.forEach((cierre) => {
        (cierre.vistas || []).forEach((vista) => {
          const grupoKey = armarClaveGrupo(cierre.pasoNombre, vista.nombre);
          if (!estadisticasTemp[grupoKey]) estadisticasTemp[grupoKey] = {};
          if (!casillasValidasTemp[grupoKey]) casillasValidasTemp[grupoKey] = [];

          vista.matriz.forEach((fila, filaIdx) => {
            const casilla = vista.casillas[filaIdx];
            if (!casilla) return;
            if (!casillasValidasTemp[grupoKey].includes(casilla)) {
              casillasValidasTemp[grupoKey].push(casilla);
            }

            fila.forEach((agenteId) => {
              if (!agenteId) return;
              const agente = (cierre.agentes || []).find((a) => a.id === agenteId);
              const nombreCompleto = agente ? `${agente.nombre} ${agente.apellido}` : agenteId;

              if (!estadisticasTemp[grupoKey][nombreCompleto]) estadisticasTemp[grupoKey][nombreCompleto] = {};
              if (!estadisticasTemp[grupoKey][nombreCompleto][casilla]) estadisticasTemp[grupoKey][nombreCompleto][casilla] = 0;
              estadisticasTemp[grupoKey][nombreCompleto][casilla]++;
            });
          });
        });
      });

      setEstadisticas(estadisticasTemp);
      setCasillasValidas(casillasValidasTemp);
    });

    event.target.value = '';
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

  const movimientos = cierres
    .flatMap((c) => (c.movimientos || []).map((m) => ({ ...m, fecha: c.fecha })))
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha) || a.hora - b.hora);

  // =========================================================
  // EXPORTAR INFORME A EXCEL
  //
  // Una hoja por (cierre, vista) con la grilla completa de 24 horas,
  // más una hoja de estadísticas agregadas por agente/casilla y una
  // de movimientos del día. Requiere el paquete "xlsx" (SheetJS) —
  // si no está instalado en el proyecto: npm install xlsx
  // =========================================================

  const generarExcel = () => {
    if (cierres.length === 0) {
      alert('Subí al menos un cierre de jornada primero.');
      return;
    }

    const wb = XLSX.utils.book_new();

    cierres.forEach((cierre, cIdx) => {
      (cierre.vistas || []).forEach((vista, vIdx) => {
        const encabezado = ['Casilla', ...Array.from({ length: 24 }, (_, h) => etiquetaHora(h))];
        const filas = vista.matriz.map((fila, filaIdx) => [
          vista.casillas[filaIdx],
          ...fila.map((agenteId) => {
            if (!agenteId) return '';
            const agente = (cierre.agentes || []).find((a) => a.id === agenteId);
            return agente ? `${agente.nombre} ${agente.apellido}` : agenteId;
          }),
        ]);
        const hoja = XLSX.utils.aoa_to_sheet([encabezado, ...filas]);
        const fechaCorta = new Date(cierre.fecha).toLocaleDateString().replace(/\//g, '-');
        const nombreHoja = `${fechaCorta} ${vista.nombre || 'Vista'}`.slice(0, 31);
        XLSX.utils.book_append_sheet(wb, hoja, nombreHoja || `Hoja${cIdx}_${vIdx}`);
      });
    });

    const filasStats = [['Grupo', 'Agente', 'Casilla', 'Veces']];
    Object.entries(estadisticas).forEach(([grupo, porAgente]) => {
      Object.entries(porAgente).forEach(([agente, porCasilla]) => {
        Object.entries(porCasilla).forEach(([casilla, veces]) => {
          filasStats.push([grupo, agente, casilla, veces]);
        });
      });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filasStats), 'Casillas por agente');

    const filasMovimientos = [['Fecha', 'Hora', 'Tipo', 'Detalle']];
    movimientos.forEach((m) => {
      let detalle = '';
      if (m.tipo === 'cambio') detalle = `${m.entraNombre} vino por ${m.saleNombre}`;
      if (m.tipo === 'refuerzo') detalle = `${m.agenteNombre} — refuerzo`;
      if (m.tipo === 'retiro') detalle = `${m.agenteNombre} — se retiró`;
      filasMovimientos.push([new Date(m.fecha).toLocaleDateString(), etiquetaHora(m.hora), m.tipo, detalle]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filasMovimientos), 'Movimientos');

    XLSX.writeFile(wb, `informe_${Date.now()}.xlsx`);
  };

  return (
    <div className="p-4 bg-gray-100 min-h-screen">
      <button onClick={() => navigate('/')} className="mb-4 flex items-center text-blue-500 hover:text-blue-700">
        <ArrowLeft size={20} className="mr-2" />
        Volver al horario
      </button>

      <h1 className="text-2xl font-bold mb-4">Estadísticas de Casillas por Agente</h1>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <input type="file" onChange={handleFileUpload} multiple accept=".json" className="p-2 border rounded" />
        <button onClick={generarExcel} className="bg-green-600 text-white p-2 rounded flex items-center shadow hover:scale-105 transition-transform">
          <FileSpreadsheet size={18} className="mr-2" /> Generar Excel
        </button>
      </div>

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

      {movimientos.length > 0 && (
        <div className="mt-8 bg-white p-4 rounded shadow">
          <h2 className="text-xl font-semibold mb-2">Movimientos</h2>
          <ul className="text-sm space-y-1">
            {movimientos.map((m, idx) => (
              <li key={idx}>{formatearMovimiento(m, m.fecha)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default EstadisticasCasillas;
