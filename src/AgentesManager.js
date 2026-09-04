import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { Plus, Trash2, ArrowLeft, Download, Upload } from 'lucide-react';

// =========================================================
// IDENTIDAD DE AGENTE (separada del estado operativo del día)
//
// Agente { id, nombre, apellido, paso (id), guardia (string) }
//
// Esto es lo estable: quién existe, de qué paso es, a qué guardia
// pertenece. NO incluye equipo/vistaPrincipal/turnoPrincipal — esos
// son del día de hoy y viven en HorarioEditable, referenciando el id
// de acá.
// =========================================================

const AgentesManager = () => {
  const navigate = useNavigate();

  const [pasos] = useState(() => {
    const saved = localStorage.getItem('pasos_v1');
    return saved ? JSON.parse(saved) : [];
  });

  const [agentes, setAgentes] = useState(() => {
    const saved = localStorage.getItem('agentes_identidad_v1');
    return saved ? JSON.parse(saved) : [];
  });

  const [pasoFiltroId, setPasoFiltroId] = useState(pasos[0]?.id || null);

  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoApellido, setNuevoApellido] = useState('');
  const [nuevaGuardia, setNuevaGuardia] = useState('');

  const guardarAgentes = (nuevos) => {
    setAgentes(nuevos);
    localStorage.setItem('agentes_identidad_v1', JSON.stringify(nuevos));
  };

  const pasoFiltro = pasos.find((p) => p.id === pasoFiltroId) || null;
  const agentesDelPaso = pasoFiltro ? agentes.filter((a) => a.paso === pasoFiltro.id) : [];

  const agregarAgente = () => {
    if (!pasoFiltro || !nuevoNombre.trim() || !nuevoApellido.trim()) return;
    const nuevo = {
      id: uuidv4(),
      nombre: nuevoNombre.trim(),
      apellido: nuevoApellido.trim(),
      paso: pasoFiltro.id,
      guardia: nuevaGuardia || (pasoFiltro.guardias || [])[0] || '',
    };
    guardarAgentes([...agentes, nuevo]);
    setNuevoNombre('');
    setNuevoApellido('');
  };

  const actualizarAgente = (id, campo, valor) =>
    guardarAgentes(agentes.map((a) => (a.id === id ? { ...a, [campo]: valor } : a)));

  const eliminarAgente = (id) => {
    if (!window.confirm('¿Eliminar este agente? También va a desaparecer de cualquier horario en curso que lo referencie.')) return;
    guardarAgentes(agentes.filter((a) => a.id !== id));
  };

  const exportarJSON = () => {
    const blob = new Blob([JSON.stringify(agentes, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const fecha = new Date().toISOString().slice(0, 10);
    link.setAttribute('download', `agentes_${fecha}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const importarJSON = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importados = JSON.parse(e.target.result);
        if (!Array.isArray(importados)) {
          alert('El archivo no tiene el formato esperado (una lista de agentes).');
          return;
        }
        // Upsert por id: lo importado reemplaza coincidencias, el resto se mantiene.
        const idsImportados = new Set(importados.map((a) => a.id));
        const restantes = agentes.filter((a) => !idsImportados.has(a.id));
        guardarAgentes([...restantes, ...importados]);
      } catch (err) {
        alert('No se pudo leer el archivo. ¿Es un JSON válido?');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  return (
    <div className="p-4 bg-gray-100 min-h-screen">
      <button onClick={() => navigate('/')} className="mb-4 flex items-center text-blue-500 hover:text-blue-700">
        <ArrowLeft size={20} className="mr-2" />
        Volver al horario
      </button>

      <h1 className="text-2xl font-bold mb-4">Agentes</h1>

      <div className="flex items-center gap-2 mb-4">
        <select
          value={pasoFiltroId || ''}
          onChange={(e) => setPasoFiltroId(e.target.value)}
          className="border p-2 font-semibold"
        >
          {pasos.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>

        <button onClick={exportarJSON} className="bg-green-500 text-white p-2 rounded flex items-center shadow hover:scale-105 transition-transform">
          <Download size={16} className="mr-1" /> Exportar todo (backup)
        </button>
        <label className="bg-gray-300 text-gray-700 p-2 rounded flex items-center shadow cursor-pointer hover:scale-105 transition-transform">
          <Upload size={16} className="mr-1" /> Importar backup
          <input type="file" accept=".json" onChange={importarJSON} className="hidden" />
        </label>
      </div>

      {!pasoFiltro && <p className="text-gray-500">Primero creá una plantilla en /plantillas.</p>}

      {pasoFiltro && (
        <>
          <div className="bg-white p-4 rounded shadow mb-4">
            <h2 className="font-semibold mb-2">Agregar agente a {pasoFiltro.nombre}</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value)}
                className="border p-2"
                placeholder="Nombre"
              />
              <input
                value={nuevoApellido}
                onChange={(e) => setNuevoApellido(e.target.value)}
                className="border p-2"
                placeholder="Apellido"
              />
              {(pasoFiltro.guardias || []).length > 0 && (
                <select value={nuevaGuardia} onChange={(e) => setNuevaGuardia(e.target.value)} className="border p-2">
                  <option value="">Sin guardia</option>
                  {pasoFiltro.guardias.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              )}
              <button onClick={agregarAgente} className="bg-blue-500 text-white p-2 rounded">
                <Plus size={20} />
              </button>
            </div>
          </div>

          <div className="bg-white rounded shadow overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="p-2">Nombre</th>
                  <th className="p-2">Apellido</th>
                  <th className="p-2">Guardia</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {agentesDelPaso.map((agente) => (
                  <tr key={agente.id} className="border-t">
                    <td className="p-2">
                      <input
                        value={agente.nombre}
                        onChange={(e) => actualizarAgente(agente.id, 'nombre', e.target.value)}
                        className="border p-1 w-full"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        value={agente.apellido}
                        onChange={(e) => actualizarAgente(agente.id, 'apellido', e.target.value)}
                        className="border p-1 w-full"
                      />
                    </td>
                    <td className="p-2">
                      {(pasoFiltro.guardias || []).length > 0 ? (
                        <select
                          value={agente.guardia || ''}
                          onChange={(e) => actualizarAgente(agente.id, 'guardia', e.target.value)}
                          className="border p-1"
                        >
                          <option value="">Sin guardia</option>
                          {pasoFiltro.guardias.map((g) => (
                            <option key={g} value={g}>{g}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-gray-400 text-sm">—</span>
                      )}
                    </td>
                    <td className="p-2">
                      <button onClick={() => eliminarAgente(agente.id)} className="text-red-500 hover:text-red-700">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {agentesDelPaso.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-gray-400">Sin agentes cargados todavía.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default AgentesManager;
 
