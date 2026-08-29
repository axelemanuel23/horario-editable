// utils/storage.js
const STORAGE_KEYS = {
  AGENTES: 'agentes_v2',
  MATRICES: 'matrices_v2',
  CONFIG: 'config_v2',
  HISTORIAL: 'historial_v2'
};

export const cargarEstadoInicial = () => {
  try {
    // Intentar cargar datos de la versión 2
    const agentes = JSON.parse(localStorage.getItem(STORAGE_KEYS.AGENTES));
    const matrices = JSON.parse(localStorage.getItem(STORAGE_KEYS.MATRICES));
    const config = JSON.parse(localStorage.getItem(STORAGE_KEYS.CONFIG));
    const historial = JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORIAL));
    
    if (agentes && matrices && config) {
      return {
        agentes,
        matrices,
        config,
        historial: historial || []
      };
    }
    
    // Si no hay datos v2, intentar migrar de v1
    return migrarDesdeV1();
  } catch (error) {
    console.error('Error cargando estado:', error);
    return null;
  }
};

const migrarDesdeV1 = () => {
  const agentesV1 = JSON.parse(localStorage.getItem('agentes') || '[]');
  const matrizV1 = JSON.parse(localStorage.getItem('matriz') || '[]');
  const encabezadosV1 = JSON.parse(localStorage.getItem('encabezadosFilas') || '[]');
  const horariosV1 = JSON.parse(localStorage.getItem('horarios') || '[]');
  const sectoresDataV1 = JSON.parse(localStorage.getItem('sectoresData') || '[]');
  
  if (agentesV1.length === 0 && matrizV1.length === 0) {
    return null;
  }
  
  // Crear mapa de nombre→ID para agentes
  const mapaAgentes = {};
  const nuevosAgentes = agentesV1.map(agente => {
    const nombreCompleto = `${agente.nombre} ${agente.apellido}`;
    mapaAgentes[nombreCompleto] = agente.id;
    return {
      ...agente,
      equipo: agente.sector || 'Micro'
    };
  });
  
  // Migrar matriz
  const nuevaMatrizEntrada = Array(16).fill().map(() => Array(10).fill(null));
  const nuevaMatrizSalida = Array(11).fill().map(() => Array(10).fill(null));
  
  matrizV1.forEach((fila, filaIndex) => {
    fila.forEach((celda, colIndex) => {
      if (celda && mapaAgentes[celda]) {
        const esEntrada = encabezadosV1[filaIndex]?.toLowerCase().includes('entrada');
        const esSalida = encabezadosV1[filaIndex]?.toLowerCase().includes('salida');
        
        if (esEntrada && filaIndex < 16) {
          nuevaMatrizEntrada[filaIndex][colIndex] = mapaAgentes[celda];
        } else if (esSalida && filaIndex < 11) {
          nuevaMatrizSalida[filaIndex][colIndex] = mapaAgentes[celda];
        }
      }
    });
  });
  
  return {
    agentes: nuevosAgentes,
    matrices: {
      entrada: nuevaMatrizEntrada,
      salida: nuevaMatrizSalida
    },
    config: {
      horarios: horariosV1,
      casillas: {
        entrada: Array(16).fill().map((_, i) => `Entrada ${i + 1}`),
        salida: Array(11).fill().map((_, i) => `Salida ${i + 1}`)
      }
    },
    historial: []
  };
};

export const guardarEstado = (estado) => {
  localStorage.setItem(STORAGE_KEYS.AGENTES, JSON.stringify(estado.agentes));
  localStorage.setItem(STORAGE_KEYS.MATRICES, JSON.stringify(estado.matrices));
  localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(estado.config));
  localStorage.setItem(STORAGE_KEYS.HISTORIAL, JSON.stringify(estado.historial));
};

export const limpiarEstado = () => {
  Object.values(STORAGE_KEYS).forEach(key => {
    localStorage.removeItem(key);
  });
  // También limpiar datos antiguos
  ['horarios', 'encabezadosFilas', 'matriz', 'agentes', 'sectoresData'].forEach(key => {
    localStorage.removeItem(key);
  });
};
