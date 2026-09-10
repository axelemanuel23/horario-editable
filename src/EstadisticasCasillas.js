import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx-js-style';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ArrowLeft, FileSpreadsheet } from 'lucide-react';

// =========================================================
// FUENTE DE DATOS: cierres de jornada (JSON), ya no CSV.
//
// Cada archivo subido es un snapshot generado por "Cerrar Jornada" en
// HorarioEditable:
// { pasoNombre, fecha, turnos, vistas: [{nombre, casillas, ordenDescendente, matriz}],
//   agentes: [{id, nombre, apellido, tipo, refuerzo, ...}], movimientos: [...] }
//
// El grupo de estadísticas (gráfico de barras) se arma como "Paso ·
// Vista" (o solo "Paso" si la vista no tiene nombre, para pasos de
// una sola vista) — esto no cambió.
// =========================================================

function armarClaveGrupo(pasoNombre, vistaNombre) {
  if (!pasoNombre) return vistaNombre || 'Sin paso';
  return vistaNombre ? `${pasoNombre} · ${vistaNombre}` : pasoNombre;
}

function etiquetaHora(h) {
  return `${String(h).padStart(2, '0')}:00`;
}

// Hora "de llegada para el relevo": 15 minutos antes de la hora real
// de inicio. Solo se usa para el encabezado de la categoría
// Inspectores en el informe — Comisionados y Refuerzos muestran su
// horario tal cual está cargado, sin este ajuste (ver nota en
// construirBloqueRoster).
function etiquetaMenos15(hora) {
  const horaAnterior = (hora + 23) % 24;
  return `${String(horaAnterior).padStart(2, '0')}:45`;
}

// Mismo cálculo de ventana de turno que usa HorarioEditable — se
// duplica acá (función chica y pura) para no acoplar este archivo,
// que solo lee snapshots JSON, a App.js.
function construirHorasTurno(horaInicio, horaFin) {
  const horas = [];
  let h = horaInicio;
  for (let i = 0; i < 24; i++) {
    horas.push(h);
    h = (h + 1) % 24;
    if (h === horaFin) break;
  }
  return horas;
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
  if (m.tipo === 'ausente_no_asignado') {
    return `${fechaTxt} ${etiquetaHora(m.hora)} — ${m.agenteNombre} — no fue asignado, quedó ausente al cierre`;
  }
  return '';
}

// =========================================================
// COLORES DEL INFORME — aproximados a la planilla de referencia.
// Son los únicos valores a tocar si hace falta ajustar la paleta;
// todo el resto de construirLibroExcel los usa desde acá.
// (Formato: hex sin "#", como lo pide xlsx-js-style.)
// =========================================================
const COLOR_CATEGORIA = {
  Inspectores: 'E6D5F7',
  Comisionados: 'FBD9B4',
  'Refuerzo Medio': 'FFF2A8',
  'Refuerzo Completo': 'FFE699',
};
const COLOR_CASILLA_HEADER = 'D9D9D9';
const COLOR_TABLA_SUBHEADER = 'F2F2F2';
const COLOR_CIERRE = '92D050';

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
  // INFORME EXCEL — dos pasos separados a propósito:
  //
  //   1) prepararDatosInforme: arma la información del reporte en una
  //      forma neutral (arrays/objetos simples), sin nada específico
  //      de Excel ni de estilos.
  //
  //   2) construirLibroExcel: decide cómo se ve cada hoja (layout,
  //      colores, merges). Es la única función con conocimiento de la
  //      librería xlsx-js-style.
  //
  // Requiere el paquete "xlsx-js-style" (fork de SheetJS con soporte
  // de escritura de estilos — el paquete "xlsx" normal no puede
  // escribir colores de celda): npm install xlsx-js-style
  //
  // Una hoja por (cierre, turno). Cada hoja incluye:
  //   - el panel de categorías del día completo (Inspectores por cada
  //     turno, Comisionados por cada turno, Refuerzo Medio/Completo
  //     agrupados por horario) — el MISMO panel se repite en todas
  //     las hojas del mismo cierre, a propósito.
  //   - las tablas de casillas de ese turno puntual (todas las vistas
  //     del paso, en el orden real de cada vista — respetando
  //     ordenDescendente — 3 tablas por fila de grilla).
  // =========================================================

  function prepararDatosInforme() {
    const hojasPorTurno = [];

    cierres.forEach((cierre) => {
      const turnos = cierre.turnos || [];
      const agentes = cierre.agentes || [];

      // --- Panel de categorías del día completo (igual en toda hoja) ---
      // La resta de 15' aplica a TODAS las categorías (Inspectores,
      // Comisionados, Refuerzos) — es puramente un ajuste de texto para
      // esta planilla, la app en sí sigue trabajando siempre en punto.
      const categoriasDia = [];

      turnos.forEach((turno) => {
        const inspectores = agentes.filter(
          (a) => a.turnoPrincipal === turno.nombre && a.tipo !== 'comisionado' && !a.horario
        );
        categoriasDia.push({
          categoria: 'Inspectores',
          horaLabel: etiquetaMenos15(turno.horaInicio),
          agentes: inspectores.map((a) => ({ nombre: `${a.apellido}, ${a.nombre}`, horas: a.horasTrabajadas || 0 })),
        });

        const comisionados = agentes.filter((a) => a.turnoPrincipal === turno.nombre && a.tipo === 'comisionado');
        categoriasDia.push({
          categoria: 'Comisionados',
          horaLabel: etiquetaMenos15(turno.horaInicio),
          agentes: comisionados.map((a) => ({ nombre: `${a.apellido}, ${a.nombre}`, horas: a.horasTrabajadas || 0 })),
        });
      });

      // Refuerzos: agrupados por categoría+horaInicio realmente
      // asignados ese día (no por turno — un refuerzo puede no tener
      // turno asignado). Solo se listan los grupos que efectivamente
      // existieron (a diferencia de Inspectores/Comisionados, que se
      // muestran siempre aunque den 0, igual que la planilla de
      // referencia).
      const refuerzosAgrupados = {};
      agentes.forEach((a) => {
        if (!a.horario) return;
        if (a.horario.categoria !== 'refuerzo_medio' && a.horario.categoria !== 'refuerzo_completo') return;
        const clave = `${a.horario.categoria}-${a.horario.horaInicio}`;
        if (!refuerzosAgrupados[clave]) {
          refuerzosAgrupados[clave] = { categoria: a.horario.categoria, horaInicio: a.horario.horaInicio, agentes: [] };
        }
        refuerzosAgrupados[clave].agentes.push(a);
      });
      Object.values(refuerzosAgrupados)
        .sort((a, b) => a.horaInicio - b.horaInicio)
        .forEach((grupo) => {
          categoriasDia.push({
            categoria: grupo.categoria === 'refuerzo_completo' ? 'Refuerzo Completo' : 'Refuerzo Medio',
            horaLabel: etiquetaMenos15(grupo.horaInicio),
            agentes: grupo.agentes.map((a) => ({ nombre: `${a.apellido}, ${a.nombre}`, horas: a.horasTrabajadas || 0 })),
          });
        });

      // --- Una hoja por turno, con las tablas de casillas de ese turno ---
      turnos.forEach((turno) => {
        const horasVentana = construirHorasTurno(turno.horaInicio, turno.horaFin);
        const tablasCasillas = [];

        (cierre.vistas || []).forEach((vista) => {
          const indices = vista.casillas.map((_, i) => i);
          if (vista.ordenDescendente) indices.reverse();

          indices.forEach((filaIdx) => {
            const casillaNombre = vista.casillas[filaIdx];
            const filas = horasVentana.map((h) => {
              const agenteId = vista.matriz[filaIdx]?.[h] ?? null;
              const agente = agenteId ? agentes.find((a) => a.id === agenteId) : null;
              return { hora: etiquetaHora(h), agenteNombre: agente ? `${agente.apellido}, ${agente.nombre}` : '' };
            });
            tablasCasillas.push({ casillaNombre, filas, horaCierre: etiquetaHora(turno.horaFin) });
          });
        });

        hojasPorTurno.push({
          pasoNombre: cierre.pasoNombre,
          fecha: cierre.fecha,
          turnoNombre: turno.nombre,
          categoriasDia,
          tablasCasillas,
        });
      });
    });

    const statsFilas = [];
    Object.entries(estadisticas).forEach(([grupo, porAgente]) => {
      Object.entries(porAgente).forEach(([agente, porCasilla]) => {
        Object.entries(porCasilla).forEach(([casilla, veces]) => {
          statsFilas.push({ grupo, agente, casilla, veces });
        });
      });
    });

    const movimientosFilas = movimientos.map((m) => ({
      fecha: new Date(m.fecha).toLocaleDateString(),
      hora: etiquetaHora(m.hora),
      tipo: m.tipo,
      detalle:
        m.tipo === 'cambio' ? `${m.entraNombre} vino por ${m.saleNombre}` :
        m.tipo === 'refuerzo' ? `${m.agenteNombre} — refuerzo` :
        m.tipo === 'retiro' ? `${m.agenteNombre} — se retiró` :
        m.tipo === 'ausente_no_asignado' ? `${m.agenteNombre} — no fue asignado, quedó ausente` : '',
    }));

    return { hojasPorTurno, statsFilas, movimientosFilas };
  }

  // --- construcción de celdas con estilo (helper de la única función
  // que conoce xlsx-js-style) ---
  function celda(valor, estilo) {
    if (valor === '' || valor == null) return estilo ? { v: '', t: 's', s: estilo } : '';
    return { v: valor, t: typeof valor === 'number' ? 'n' : 's', s: estilo };
  }

  const ESTILO_HEADER_CATEGORIA = (colorHex) => ({
    fill: { fgColor: { rgb: colorHex } },
    font: { bold: true },
    alignment: { horizontal: 'left' },
  });
  const ESTILO_CASILLA_HEADER = {
    fill: { fgColor: { rgb: COLOR_CASILLA_HEADER } },
    font: { bold: true },
    alignment: { horizontal: 'center' },
  };
  const ESTILO_TABLA_SUBHEADER = {
    fill: { fgColor: { rgb: COLOR_TABLA_SUBHEADER } },
    font: { bold: true },
    alignment: { horizontal: 'center' },
  };
  const ESTILO_CIERRE = { fill: { fgColor: { rgb: COLOR_CIERRE } }, font: { bold: true } };

  // Panel izquierdo (columnas A-B): un bloque por categoría, con
  // encabezado coloreado + una fila por agente + fila separadora.
  function construirBloqueRoster(categoriasDia) {
    const filas = [];
    categoriasDia.forEach((cat) => {
      const colorHeader = COLOR_CATEGORIA[cat.categoria] || 'D9D9D9';
      filas.push([
        celda(`${cat.categoria.toUpperCase()} ${cat.horaLabel}HS`, ESTILO_HEADER_CATEGORIA(colorHeader)),
        celda('', { fill: { fgColor: { rgb: colorHeader } } }),
      ]);
      if (cat.agentes.length === 0) {
        filas.push([celda('—'), celda('')]);
      } else {
        cat.agentes.forEach((a) => filas.push([celda(a.nombre), celda(a.horas)]));
      }
      filas.push([celda(''), celda('')]); // separador
    });
    return filas;
  }

  // Una tabla de casilla (3 columnas: Agentes / Entrada / Salida):
  // encabezado con el nombre de la casilla (mergeado en 3 columnas),
  // subencabezado de columnas, una fila por hora del turno, y la fila
  // verde de cierre con la hora de fin del turno.
  function construirTablaCasilla(tabla) {
    const filas = [];
    filas.push([
      celda(`CASILLA ${tabla.casillaNombre}`, ESTILO_CASILLA_HEADER),
      celda('', ESTILO_CASILLA_HEADER),
      celda('', ESTILO_CASILLA_HEADER),
    ]);
    filas.push([
      celda('AGENTES', ESTILO_TABLA_SUBHEADER),
      celda('ENTRADA', ESTILO_TABLA_SUBHEADER),
      celda('SALIDA', ESTILO_TABLA_SUBHEADER),
    ]);
    tabla.filas.forEach((f) => {
      filas.push([celda(f.agenteNombre), celda(f.hora), celda('')]);
    });
    filas.push([celda('', ESTILO_CIERRE), celda(tabla.horaCierre, ESTILO_CIERRE), celda('', ESTILO_CIERRE)]);
    return filas;
  }

  // Arma la hoja completa de un turno: roster a la izquierda (cols
  // A-B) + grilla de tablas de casilla a la derecha (desde col D, de
  // a 3 tablas por fila de bloques, con una columna espaciadora entre
  // cada tabla y una fila espaciadora entre cada bloque).
  function construirHojaTurno(hojaData) {
    const TABLAS_POR_FILA = 3;
    const COL_INICIO_TABLAS = 3; // deja B (roster) + C (espaciador)
    const ANCHO_TABLA = 4; // 3 columnas + 1 espaciadora

    const grid = [];
    const merges = [];
    const setCell = (r, c, valor) => {
      if (!grid[r]) grid[r] = [];
      grid[r][c] = valor;
    };

    // Roster
    const filasRoster = construirBloqueRoster(hojaData.categoriasDia);
    filasRoster.forEach((fila, r) => {
      setCell(r, 0, fila[0]);
      setCell(r, 1, fila[1]);
    });

    // Tablas de casilla, en bloques de 3
    const bloques = [];
    for (let i = 0; i < hojaData.tablasCasillas.length; i += TABLAS_POR_FILA) {
      bloques.push(hojaData.tablasCasillas.slice(i, i + TABLAS_POR_FILA));
    }

    let filaCursor = 0;
    bloques.forEach((bloque) => {
      let maxAltura = 0;
      bloque.forEach((tabla, idx) => {
        const filasTabla = construirTablaCasilla(tabla);
        const colBase = COL_INICIO_TABLAS + idx * ANCHO_TABLA;
        filasTabla.forEach((filaCeldas, rOffset) => {
          filaCeldas.forEach((cellObj, cOffset) => {
            setCell(filaCursor + rOffset, colBase + cOffset, cellObj);
          });
        });
        merges.push({ s: { r: filaCursor, c: colBase }, e: { r: filaCursor, c: colBase + 2 } });
        if (filasTabla.length > maxAltura) maxAltura = filasTabla.length;
      });
      filaCursor += maxAltura + 1; // espacio entre bloques de tablas
    });

    const maxRow = Math.max(grid.length, filasRoster.length);
    let maxCol = 2;
    grid.forEach((fila) => {
      if (fila && fila.length - 1 > maxCol) maxCol = fila.length - 1;
    });

    const aoa = [];
    for (let r = 0; r < maxRow; r++) {
      const fila = [];
      for (let c = 0; c <= maxCol; c++) {
        fila.push(grid[r]?.[c] ?? '');
      }
      aoa.push(fila);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!merges'] = merges;
    ws['!cols'] = Array.from({ length: maxCol + 1 }, () => ({ wch: 14 }));
    return ws;
  }

  // --- función principal: arma el libro completo ---
  function construirLibroExcel({ hojasPorTurno, statsFilas, movimientosFilas }) {
    const wb = XLSX.utils.book_new();

    hojasPorTurno.forEach((hojaData, idx) => {
      const ws = construirHojaTurno(hojaData);
      const fechaCorta = new Date(hojaData.fecha).toLocaleDateString().replace(/\//g, '-');
      const nombreHoja = `${fechaCorta} ${hojaData.turnoNombre}`.slice(0, 31) || `Turno${idx}`;
      XLSX.utils.book_append_sheet(wb, ws, nombreHoja);
    });

    const hojaStats = XLSX.utils.aoa_to_sheet([
      ['Grupo', 'Agente', 'Casilla', 'Veces'],
      ...statsFilas.map((r) => [r.grupo, r.agente, r.casilla, r.veces]),
    ]);
    XLSX.utils.book_append_sheet(wb, hojaStats, 'Casillas por agente');

    const hojaMovimientos = XLSX.utils.aoa_to_sheet([
      ['Fecha', 'Hora', 'Tipo', 'Detalle'],
      ...movimientosFilas.map((m) => [m.fecha, m.hora, m.tipo, m.detalle]),
    ]);
    XLSX.utils.book_append_sheet(wb, hojaMovimientos, 'Movimientos');

    return wb;
  }

  const generarExcel = () => {
    if (cierres.length === 0) {
      alert('Subí al menos un cierre de jornada primero.');
      return;
    }
    const datos = prepararDatosInforme();
    const wb = construirLibroExcel(datos);
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
