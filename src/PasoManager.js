import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { Plus, Trash2, ArrowLeft, Pencil, Download, Upload, Package } from 'lucide-react';

// =========================================================
// MODELO DE UNA PLANTILLA (PASO)
//
// Paso {
//   id, nombre,
//   equipos: string[]                 // ej. ["Micro","Corredor"] o ["Micro"]
//   guardias: string[]                 // ej. ["A","B"] — opcional, puede quedar vacío
//   vistas: [{ id, nombre, casillas: [{ id, numero, nombre }] }]
//   turnos: [{ id, nombre, horaInicio, horaFin }]   // horas 0-23, horaFin puede cruzar medianoche
// }
//
// Si vistas.length === 1, el resto de la app no muestra pestaña de
// sector ni "vista principal" para ese paso — no hace falta ninguna
// bandera especial, simplemente no hay nada contra qué comparar.
// =========================================================

const HORAS_DEL_DIA = Array.from({ length: 24 }, (_, h) => h);

function pasoVacio() {
  return {
    id: uuidv4(),
    nombre: '',
    equipos: ['Micro'],
    guardias: [],
    vistas: [{ id: uuidv4(), nombre: '', casillas: [] }],
    turnos: [],
  };
}

const PasoManager = () => {
  const navigate = useNavigate();

  const [pasos, setPasos] = useState(() => {
    const saved = localStorage.getItem('pasos_v1');
    return saved ? JSON.parse(saved) : [];
  });

  const [editando, setEditando] = useState(null); // copia editable de un paso, o null

  const guardarPasos = (nuevosPasos) => {
    setPasos(nuevosPasos);
    localStorage.setItem('pasos_v1', JSON.stringify(nuevosPasos));
  };

  const nuevoPaso = () => setEditando(pasoVacio());

  const editarPaso = (paso) => {
    const copia = JSON.parse(JSON.stringify(paso));
    if (!copia.guardias) copia.guardias = [];
    setEditando(copia);
  };

  const eliminarPaso = (id) => {
    if (!window.confirm('¿Eliminar esta plantilla? No se puede deshacer.')) return;
    guardarPasos(pasos.filter((p) => p.id !== id));
  };

  const descargarJSON = (data, nombreArchivo) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', nombreArchivo);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportarPaso = (paso) => {
    descargarJSON(paso, `plantilla_${paso.nombre}.json`);
  };

  const exportarPaquete = (paso) => {
    const saved = localStorage.getItem('agentes_identidad_v1');
    const todosAgentes = saved ? JSON.parse(saved) : [];
    const agentesDelPaso = todosAgentes.filter((a) => a.paso === paso.id);
    descargarJSON({ paso, agentes: agentesDelPaso }, `paquete_${paso.nombre}.json`);
  };

  const importarPlantilla = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        // Acepta tanto un paso suelto como un paquete completo (paso+agentes).
        const pasoImportado = data.paso ? data.paso : data;
        if (!pasoImportado.id || !pasoImportado.nombre) {
          alert('El archivo no tiene el formato de una plantilla válida.');
          return;
        }
        const yaExiste = pasos.some((p) => p.id === pasoImportado.id);
        guardarPasos(yaExiste ? pasos.map((p) => (p.id === pasoImportado.id ? pasoImportado : p)) : [...pasos, pasoImportado]);

        if (data.agentes) {
          const savedAgentes = localStorage.getItem('agentes_identidad_v1');
          const agentesActuales = savedAgentes ? JSON.parse(savedAgentes) : [];
          const idsImportados = new Set(data.agentes.map((a) => a.id));
          const restantes = agentesActuales.filter((a) => !idsImportados.has(a.id));
          localStorage.setItem('agentes_identidad_v1', JSON.stringify([...restantes, ...data.agentes]));
          alert(`Plantilla y ${data.agentes.length} agente(s) importados.`);
        }
      } catch (err) {
        alert('No se pudo leer el archivo. ¿Es un JSON válido?');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const confirmarGuardado = () => {
    if (!editando.nombre.trim()) {
      alert('El paso necesita un nombre.');
      return;
    }
    if (editando.vistas.length === 0) {
      alert('Necesita al menos una vista (aunque el paso no maneje sectores, tiene que haber una).');
      return;
    }
    const existe = pasos.some((p) => p.id === editando.id);
    guardarPasos(existe ? pasos.map((p) => (p.id === editando.id ? editando : p)) : [...pasos, editando]);
    setEditando(null);
  };

  // ---- helpers para editar el paso en curso ----

  const setNombre = (nombre) => setEditando({ ...editando, nombre });

  const agregarEquipo = (nombre) => {
    if (!nombre.trim() || editando.equipos.includes(nombre.trim())) return;
    setEditando({ ...editando, equipos: [...editando.equipos, nombre.trim()] });
  };
  const quitarEquipo = (nombre) =>
    setEditando({ ...editando, equipos: editando.equipos.filter((e) => e !== nombre) });

  const agregarGuardia = (nombre) => {
    if (!nombre.trim() || editando.guardias.includes(nombre.trim())) return;
    setEditando({ ...editando, guardias: [...editando.guardias, nombre.trim()] });
  };
  const quitarGuardia = (nombre) =>
    setEditando({ ...editando, guardias: editando.guardias.filter((g) => g !== nombre) });

  const agregarTurno = () =>
    setEditando({
      ...editando,
      turnos: [...editando.turnos, { id: uuidv4(), nombre: '', horaInicio: 6, horaFin: 16 }],
    });
  const actualizarTurno = (id, campo, valor) =>
    setEditando({
      ...editando,
      turnos: editando.turnos.map((t) => (t.id === id ? { ...t, [campo]: valor } : t)),
    });
  const quitarTurno = (id) =>
    setEditando({ ...editando, turnos: editando.turnos.filter((t) => t.id !== id) });

  const agregarVista = () =>
    setEditando({
      ...editando,
      vistas: [...editando.vistas, { id: uuidv4(), nombre: '', casillas: [] }],
    });
  const actualizarNombreVista = (vistaId, nombre) =>
    setEditando({
      ...editando,
      vistas: editando.vistas.map((v) => (v.id === vistaId ? { ...v, nombre } : v)),
    });
  const quitarVista = (vistaId) =>
    setEditando({ ...editando, vistas: editando.vistas.filter((v) => v.id !== vistaId) });

  const generarCasillas = (vistaId, cantidad) => {
    const n = parseInt(cantidad, 10);
    if (!n || n < 1) return;
    setEditando({
      ...editando,
      vistas: editando.vistas.map((v) => {
        if (v.id !== vistaId) return v;
        const casillas = Array.from({ length: n }, (_, i) => ({
          id: uuidv4(),
          numero: i + 1,
          nombre: v.nombre ? `${v.nombre} ${i + 1}` : `Casilla ${i + 1}`,
        }));
        return { ...v, casillas };
      }),
    });
  };

  const agregarCasillaIndividual = (vistaId, nombre) => {
    if (!nombre.trim()) return;
    setEditando({
      ...editando,
      vistas: editando.vistas.map((v) => {
        if (v.id !== vistaId) return v;
        const siguienteNumero = v.casillas.length + 1;
        return {
          ...v,
          casillas: [...v.casillas, { id: uuidv4(), numero: siguienteNumero, nombre: nombre.trim() }],
        };
      }),
    });
  };

  const renombrarCasilla = (vistaId, casillaId, nombre) =>
    setEditando({
      ...editando,
      vistas: editando.vistas.map((v) =>
        v.id !== vistaId
          ? v
          : { ...v, casillas: v.casillas.map((c) => (c.id === casillaId ? { ...c, nombre } : c)) }
      ),
    });

  const quitarCasilla = (vistaId, casillaId) =>
    setEditando({
      ...editando,
      vistas: editando.vistas.map((v) =>
        v.id !== vistaId ? v : { ...v, casillas: v.casillas.filter((c) => c.id !== casillaId) }
      ),
    });

  // =========================================================
  // VISTA: LISTADO DE PASOS
  // =========================================================

  if (!editando) {
    return (
      <div className="p-4 bg-gray-100 min-h-screen">
        <button onClick={() => navigate('/')} className="mb-4 flex items-center text-blue-500 hover:text-blue-700">
          <ArrowLeft size={20} className="mr-2" />
          Volver al horario
        </button>

        <h1 className="text-2xl font-bold mb-4">Plantillas de pasos</h1>

        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={nuevoPaso}
            className="bg-blue-500 text-white p-2 rounded flex items-center shadow hover:scale-105 transition-transform"
          >
            <Plus size={20} className="mr-2" /> Nueva plantilla
          </button>
          <label className="bg-gray-300 text-gray-700 p-2 rounded flex items-center cursor-pointer shadow hover:scale-105 transition-transform">
            <Upload size={16} className="mr-2" /> Importar plantilla o paquete
            <input type="file" accept=".json" onChange={importarPlantilla} className="hidden" />
          </label>
        </div>

        <div className="flex flex-col gap-3">
          {pasos.map((paso) => (
            <div key={paso.id} className="bg-white p-4 rounded shadow flex items-center justify-between">
              <div>
                <div className="font-semibold text-lg">{paso.nombre}</div>
                <div className="text-sm text-gray-600">
                  {paso.vistas.length} vista{paso.vistas.length === 1 ? '' : 's'} · {paso.equipos.join(', ')} ·{' '}
                  {paso.turnos.length} turno{paso.turnos.length === 1 ? '' : 's'}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => exportarPaso(paso)} className="bg-gray-200 p-2 rounded hover:bg-gray-300" title="Exportar solo la plantilla">
                  <Download size={16} />
                </button>
                <button onClick={() => exportarPaquete(paso)} className="bg-gray-200 p-2 rounded hover:bg-gray-300" title="Exportar plantilla + agentes en un solo archivo">
                  <Package size={16} />
                </button>
                <button onClick={() => editarPaso(paso)} className="bg-gray-200 p-2 rounded hover:bg-gray-300">
                  <Pencil size={16} />
                </button>
                <button onClick={() => eliminarPaso(paso.id)} className="bg-red-500 text-white p-2 rounded hover:bg-red-600">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
          {pasos.length === 0 && <p className="text-gray-500">Todavía no hay plantillas creadas.</p>}
        </div>
      </div>
    );
  }

  // =========================================================
  // VISTA: EDITOR DE UN PASO
  // =========================================================

  return (
    <div className="p-4 bg-gray-100 min-h-screen">
      <button onClick={() => setEditando(null)} className="mb-4 flex items-center text-blue-500 hover:text-blue-700">
        <ArrowLeft size={20} className="mr-2" />
        Volver al listado
      </button>

      <h1 className="text-2xl font-bold mb-4">
        {pasos.some((p) => p.id === editando.id) ? 'Editar plantilla' : 'Nueva plantilla'}
      </h1>

      <div className="bg-white p-4 rounded shadow mb-4">
        <label className="block text-sm font-semibold mb-1">Nombre del paso</label>
        <input
          value={editando.nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="border p-2 w-full mb-4"
          placeholder="Ej. Tancredo Neves"
        />

        <label className="block text-sm font-semibold mb-1">Equipos base (además de Casilla, que es automático)</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {editando.equipos.map((equipo) => (
            <span key={equipo} className="bg-gray-200 px-3 py-1 rounded-full flex items-center gap-2">
              {equipo}
              <button onClick={() => quitarEquipo(equipo)} className="text-red-500 hover:text-red-700">
                ×
              </button>
            </span>
          ))}
        </div>
        <NuevoItemInput placeholder="Nombre del equipo (ej. Corredor)" onAdd={agregarEquipo} />
      </div>

      <div className="bg-white p-4 rounded shadow mb-4">
        <label className="block text-sm font-semibold mb-1">
          Guardias (opcional — dejar vacío si el paso no rota por guardias)
        </label>
        <div className="flex flex-wrap gap-2 mb-2">
          {(editando.guardias || []).map((guardia) => (
            <span key={guardia} className="bg-gray-200 px-3 py-1 rounded-full flex items-center gap-2">
              {guardia}
              <button onClick={() => quitarGuardia(guardia)} className="text-red-500 hover:text-red-700">
                ×
              </button>
            </span>
          ))}
        </div>
        <NuevoItemInput placeholder="Nombre de guardia (ej. A)" onAdd={agregarGuardia} />
      </div>

      <div className="bg-white p-4 rounded shadow mb-4">
        <h2 className="font-semibold mb-2">Turnos</h2>
        {editando.turnos.map((turno) => (
          <div key={turno.id} className="flex items-center gap-2 mb-2">
            <input
              value={turno.nombre}
              onChange={(e) => actualizarTurno(turno.id, 'nombre', e.target.value)}
              className="border p-2 flex-1"
              placeholder="Nombre del turno (ej. Mañana)"
            />
            <select
              value={turno.horaInicio}
              onChange={(e) => actualizarTurno(turno.id, 'horaInicio', Number(e.target.value))}
              className="border p-2"
            >
              {HORAS_DEL_DIA.map((h) => (
                <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
              ))}
            </select>
            <span>a</span>
            <select
              value={turno.horaFin}
              onChange={(e) => actualizarTurno(turno.id, 'horaFin', Number(e.target.value))}
              className="border p-2"
            >
              {HORAS_DEL_DIA.map((h) => (
                <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
              ))}
            </select>
            <button onClick={() => quitarTurno(turno.id)} className="text-red-500 hover:text-red-700">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <button onClick={agregarTurno} className="bg-gray-200 p-2 rounded flex items-center mt-1 hover:bg-gray-300">
          <Plus size={16} className="mr-1" /> Agregar turno
        </button>
      </div>

      <div className="bg-white p-4 rounded shadow mb-4">
        <h2 className="font-semibold mb-2">
          Vistas (si el paso no maneja sectores, dejá solo una)
        </h2>
        {editando.vistas.map((vista) => (
          <div key={vista.id} className="border rounded p-3 mb-3">
            <div className="flex items-center gap-2 mb-2">
              <input
                value={vista.nombre}
                onChange={(e) => actualizarNombreVista(vista.id, e.target.value)}
                className="border p-2 flex-1"
                placeholder="Nombre de la vista (ej. Entrada) — dejar vacío si es única"
              />
              {editando.vistas.length > 1 && (
                <button onClick={() => quitarVista(vista.id)} className="text-red-500 hover:text-red-700">
                  <Trash2 size={16} />
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2 mb-2">
              {vista.casillas.map((casilla) => (
                <span key={casilla.id} className="bg-gray-200 px-2 py-1 rounded flex items-center gap-1 text-sm">
                  <input
                    value={casilla.nombre}
                    onChange={(e) => renombrarCasilla(vista.id, casilla.id, e.target.value)}
                    className="bg-transparent w-24"
                  />
                  <button onClick={() => quitarCasilla(vista.id, casilla.id)} className="text-red-500 hover:text-red-700">
                    ×
                  </button>
                </span>
              ))}
              {vista.casillas.length === 0 && <span className="text-gray-400 text-sm">Sin casillas todavía.</span>}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <GenerarCasillasControl onGenerar={(n) => generarCasillas(vista.id, n)} />
              <NuevoItemInput placeholder="Nombre de casilla individual (ej. TVF)" onAdd={(n) => agregarCasillaIndividual(vista.id, n)} />
            </div>
          </div>
        ))}
        <button onClick={agregarVista} className="bg-gray-200 p-2 rounded flex items-center hover:bg-gray-300">
          <Plus size={16} className="mr-1" /> Agregar vista
        </button>
      </div>

      <button
        onClick={confirmarGuardado}
        className="bg-green-500 text-white p-2 rounded shadow hover:scale-105 transition-transform"
      >
        Guardar plantilla
      </button>
    </div>
  );
};

// Input reutilizable: escribir + Enter o click agrega, y se limpia solo.
function NuevoItemInput({ placeholder, onAdd }) {
  const [valor, setValor] = useState('');
  const confirmar = () => {
    onAdd(valor);
    setValor('');
  };
  return (
    <div className="flex items-center gap-1">
      <input
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && confirmar()}
        className="border p-2"
        placeholder={placeholder}
      />
      <button onClick={confirmar} className="bg-blue-500 text-white p-2 rounded">
        <Plus size={16} />
      </button>
    </div>
  );
}

// Control para generar N casillas autonumeradas de una sola vez
// (para el caso típico de "16 casillas de Entrada").
function GenerarCasillasControl({ onGenerar }) {
  const [cantidad, setCantidad] = useState('');
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        min="1"
        value={cantidad}
        onChange={(e) => setCantidad(e.target.value)}
        className="border p-2 w-20"
        placeholder="Cant."
      />
      <button
        onClick={() => {
          onGenerar(cantidad);
          setCantidad('');
        }}
        className="bg-gray-300 p-2 rounded text-sm"
      >
        Generar casillas numeradas
      </button>
    </div>
  );
}

export default PasoManager;
