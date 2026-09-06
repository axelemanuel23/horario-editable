import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Wand2, ChevronDown, ChevronUp } from 'lucide-react';

// =========================================================
// PLANIFICACIÓN DÍA A DÍA
//
// Planificacion { [pasoId]: { [fecha "YYYY-MM-DD"]: { guardia, turnos: { [agenteId]: turnoId } } } }
//
// Separado a propósito del estado operativo del día (HorarioEditable):
// esto es la "hoja de ruta" armada con anticipación, revisable para
// cualquier fecha sin afectar la jornada en curso. Los cambios de
// último momento del día de hoy siguen pasando por Refuerzo/Cambio/
// Retirar en HorarioEditable, no acá.
//
// Asignación de turno por día: en vez de un <select> por agente, cada
// turno es un botón con un panel desplegable de checkboxes (uno por
// agente de la guardia de ese día). Tildar a alguien en un turno lo
// destilda automáticamente de cualquier otro turno que tuviera ese
// mismo día (exclusividad: un agente, un turno por día). Solo un
// panel puede estar abierto a la vez, en cualquier día del mes.
// =========================================================

function diasEnMes(year, month) {
  return new Date(year, month, 0).getDate();
}

function fechaISO(year, month, dia) {
  return `${year}-${String(month).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function nombreDia(year, month, dia) {
  const fecha = new Date(year, month - 1, dia);
  return fecha.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' });
}

const PlanificacionManager = () => {
  const navigate = useNavigate();

  const [pasos] = useState(() => {
    const saved = localStorage.getItem('pasos_v1');
    return saved ? JSON.parse(saved) : [];
  });

  const [agentesIdentidad] = useState(() => {
    const saved = localStorage.getItem('agentes_identidad_v1');
    return saved ? JSON.parse(saved) : [];
  });

  const [planificacion, setPlanificacion] = useState(() => {
    const saved = localStorage.getItem('planificacion_v1');
    return saved ? JSON.parse(saved) : {};
  });

  const [selectedPasoId, setSelectedPasoId] = useState(pasos[0]?.id || null);

  const hoy = new Date();
  const [anioMes, setAnioMes] = useState(
    `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
  );
  const [year, month] = anioMes.split('-').map(Number);

  const pasoActual = pasos.find((p) => p.id === selectedPasoId) || null;
  const planPaso = (pasoActual && planificacion[pasoActual.id]) || {};

  const guardarPlanificacion = (nuevaPlanificacion) => {
    setPlanificacion(nuevaPlanificacion);
    localStorage.setItem('planificacion_v1', JSON.stringify(nuevaPlanificacion));
  };

  const [guardiaImpar, setGuardiaImpar] = useState('');
  const [guardiaPar, setGuardiaPar] = useState('');

  // Autocompleta la guardia según la paridad elegida (impar/par), solo
  // para los días que todavía no tengan nada cargado — no pisa lo que
  // ya esté corregido a mano.
  const generarMes = () => {
    if (!pasoActual) return;
    if (!guardiaImpar || !guardiaPar) {
      alert('Elegí qué guardia corresponde a días impares y cuál a días pares.');
      return;
    }
    const dias = diasEnMes(year, month);
    const nuevoPlanPaso = { ...planPaso };
    for (let dia = 1; dia <= dias; dia++) {
      const fecha = fechaISO(year, month, dia);
      if (!nuevoPlanPaso[fecha]) {
        nuevoPlanPaso[fecha] = { guardia: dia % 2 === 1 ? guardiaImpar : guardiaPar, turnos: {} };
      }
    }
    guardarPlanificacion({ ...planificacion, [pasoActual.id]: nuevoPlanPaso });
  };

  const actualizarGuardiaDia = (fecha, guardia) => {
    const nuevoPlanPaso = { ...planPaso };
    nuevoPlanPaso[fecha] = { ...(nuevoPlanPaso[fecha] || { turnos: {} }), guardia };
    guardarPlanificacion({ ...planificacion, [pasoActual.id]: nuevoPlanPaso });
  };

  // Tilda/destilda a un agente en un turno de un día puntual. Tildar
  // pisa cualquier turno anterior que tuviera ese día (exclusividad).
  const toggleAgenteEnTurno = (fecha, agenteId, turnoId) => {
    const nuevoPlanPaso = { ...planPaso };
    const diaActual = nuevoPlanPaso[fecha] || { guardia: '', turnos: {} };
    const turnoActualDelAgente = diaActual.turnos[agenteId];
    const nuevosTurnos = { ...diaActual.turnos };

    if (turnoActualDelAgente === turnoId) {
      delete nuevosTurnos[agenteId];
    } else {
      nuevosTurnos[agenteId] = turnoId;
    }

    nuevoPlanPaso[fecha] = { ...diaActual, turnos: nuevosTurnos };
    guardarPlanificacion({ ...planificacion, [pasoActual.id]: nuevoPlanPaso });
  };

  // Un solo panel abierto a la vez, en cualquier día del mes.
  const [panelAbierto, setPanelAbierto] = useState(null); // { fecha, turnoId } | null

  const toggleadorPanel = (fecha, turnoId) => {
    setPanelAbierto((actual) =>
      actual && actual.fecha === fecha && actual.turnoId === turnoId ? null : { fecha, turnoId }
    );
  };

  const fechaHoyISO = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;

  if (!pasoActual) {
    return (
      <div className="p-4 bg-gray-100 min-h-screen">
        <button onClick={() => navigate('/')} className="mb-4 flex items-center text-blue-500 hover:text-blue-700">
          <ArrowLeft size={20} className="mr-2" /> Volver al horario
        </button>
        <p>Primero creá una plantilla en /plantillas.</p>
      </div>
    );
  }

  const dias = diasEnMes(year, month);

  return (
    <div className="p-4 bg-gray-100 min-h-screen">
      <button onClick={() => navigate('/')} className="mb-4 flex items-center text-blue-500 hover:text-blue-700">
        <ArrowLeft size={20} className="mr-2" /> Volver al horario
      </button>

      <h1 className="text-2xl font-bold mb-4">Planificación</h1>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <select value={pasoActual.id} onChange={(e) => setSelectedPasoId(e.target.value)} className="border p-2 font-semibold">
          {pasos.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>
        <input type="month" value={anioMes} onChange={(e) => setAnioMes(e.target.value)} className="border p-2" />
        <span className="text-sm text-gray-500">Impar:</span>
        <select value={guardiaImpar} onChange={(e) => setGuardiaImpar(e.target.value)} className="border p-1">
          <option value="">...</option>
          {(pasoActual.guardias || []).map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <span className="text-sm text-gray-500">Par:</span>
        <select value={guardiaPar} onChange={(e) => setGuardiaPar(e.target.value)} className="border p-1">
          <option value="">...</option>
          {(pasoActual.guardias || []).map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <button onClick={generarMes} className="bg-blue-500 text-white p-2 rounded flex items-center shadow hover:scale-105 transition-transform">
          <Wand2 size={16} className="mr-2" /> Generar mes
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {Array.from({ length: dias }, (_, i) => i + 1).map((dia) => {
          const fecha = fechaISO(year, month, dia);
          const diaPlan = planPaso[fecha] || { guardia: '', turnos: {} };
          const agentesDelDia = agentesIdentidad.filter(
            (a) => a.paso === pasoActual.id && diaPlan.guardia && a.guardia === diaPlan.guardia
          );
          const esHoy = fecha === fechaHoyISO;

          return (
            <div key={dia} className={`bg-white p-3 rounded shadow ${esHoy ? 'ring-2 ring-blue-400' : ''}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="font-semibold w-24 capitalize">{nombreDia(year, month, dia)}</span>
                {esHoy && <span className="text-xs bg-blue-100 text-blue-700 rounded px-2 py-0.5">HOY</span>}
                <select
                  value={diaPlan.guardia || ''}
                  onChange={(e) => actualizarGuardiaDia(fecha, e.target.value)}
                  className="border p-1"
                >
                  <option value="">Sin guardia</option>
                  {(pasoActual.guardias || []).map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>

              {diaPlan.guardia && (
                <div className="pl-2">
                  {agentesDelDia.length === 0 ? (
                    <span className="text-xs text-gray-400">No hay agentes cargados para la guardia {diaPlan.guardia}.</span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {pasoActual.turnos.map((t) => {
                        const cantidad = agentesDelDia.filter((a) => diaPlan.turnos[a.id] === t.id).length;
                        const abierto = panelAbierto?.fecha === fecha && panelAbierto?.turnoId === t.id;
                        return (
                          <div key={t.id} className="flex flex-col">
                            <button
                              onClick={() => toggleadorPanel(fecha, t.id)}
                              className={`text-sm px-2 py-1 rounded flex items-center gap-1 border ${
                                abierto ? 'bg-blue-500 text-white border-blue-500' : 'bg-gray-100 border-gray-300 hover:bg-gray-200'
                              }`}
                            >
                              {t.nombre} ({cantidad})
                              {abierto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>

                            {abierto && (
                              <div className="mt-1 border rounded p-2 bg-gray-50 max-h-48 overflow-y-auto w-56">
                                {agentesDelDia.map((a) => {
                                  const turnoDelAgente = diaPlan.turnos[a.id];
                                  const tildado = turnoDelAgente === t.id;
                                  const enOtroTurno = turnoDelAgente && !tildado;
                                  const nombreOtroTurno = enOtroTurno
                                    ? pasoActual.turnos.find((x) => x.id === turnoDelAgente)?.nombre
                                    : null;
                                  return (
                                    <label
                                      key={a.id}
                                      className={`flex items-center gap-2 text-sm py-0.5 ${
                                        enOtroTurno ? 'text-gray-400' : 'text-gray-800'
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={tildado}
                                        onChange={() => toggleAgenteEnTurno(fecha, a.id, t.id)}
                                      />
                                      <span>{a.apellido}, {a.nombre}</span>
                                      {enOtroTurno && (
                                        <span className="text-xs italic">(hoy: {nombreOtroTurno})</span>
                                      )}
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PlanificacionManager;
