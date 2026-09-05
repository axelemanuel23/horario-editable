import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Wand2 } from 'lucide-react';

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

  const actualizarTurnoDia = (fecha, agenteId, turnoId) => {
    const nuevoPlanPaso = { ...planPaso };
    const diaActual = nuevoPlanPaso[fecha] || { guardia: '', turnos: {} };
    nuevoPlanPaso[fecha] = { ...diaActual, turnos: { ...diaActual.turnos, [agenteId]: turnoId } };
    guardarPlanificacion({ ...planificacion, [pasoActual.id]: nuevoPlanPaso });
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
                <div className="flex flex-wrap gap-2 pl-2">
                  {agentesDelDia.map((a) => (
                    <div key={a.id} className="flex items-center gap-1 text-sm">
                      <span>{a.apellido}, {a.nombre}</span>
                      <select
                        value={diaPlan.turnos[a.id] || ''}
                        onChange={(e) => actualizarTurnoDia(fecha, a.id, e.target.value)}
                        className="border p-1 text-sm"
                      >
                        <option value="">Turno...</option>
                        {pasoActual.turnos.map((t) => (
                          <option key={t.id} value={t.id}>{t.nombre}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                  {agentesDelDia.length === 0 && (
                    <span className="text-xs text-gray-400">No hay agentes cargados para la guardia {diaPlan.guardia}.</span>
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
