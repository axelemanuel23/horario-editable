// utils/csvHandler.js
import Papa from 'papaparse';

export const exportarCSV = (estado, turno, sector) => {
  const { agentes, matrices, config } = estado;
  
  const datosCSV = [
    // Metadata
    ['version', '2.0'],
    ['turno', turno],
    ['sector_actual', sector],
    ['fecha_exportacion', new Date().toISOString()],
    
    // Agentes
    ['tipo', 'id', 'nombre', 'apellido', 'equipo', 'color'],
    ...agentes.map(agente => [
      'agente',
      agente.id,
      agente.nombre,
      agente.apellido,
      agente.equipo,
      agente.color
    ]),
    
    // Horarios
    ['horarios', ...config.horarios],
    
    // Casillas
    ['casillas_entrada', ...config.casillas.entrada],
    ['casillas_salida', ...config.casillas.salida],
    
    // Matriz Entrada
    ...matrices.entrada.map((fila, index) => [
      'matriz_entrada',
      index,
      ...fila.map(id => id || '')
    ]),
    
    // Matriz Salida
    ...matrices.salida.map((fila, index) => [
      'matriz_salida',
      index,
      ...fila.map(id => id || '')
    ]),
    
    // Historial
    ['historial', ...estado.historial.map(h => JSON.stringify(h))]
  ];
  
  const csvContent = Papa.unparse(datosCSV);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  const fecha = new Date();
  const nombreArchivo = `horario_${sector}_${turno}_${fecha.toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
  link.setAttribute('download', nombreArchivo);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  return nombreArchivo;
};

export const importarCSV = (file, callback) => {
  const reader = new FileReader();
  
  reader.onload = (e) => {
    const csvData = e.target.result;
    const parsedData = Papa.parse(csvData, { header: false }).data;
    
    const estado = {
      agentes: [],
      matrices: {
        entrada: Array(16).fill().map(() => Array(10).fill(null)),
        salida: Array(11).fill().map(() => Array(10).fill(null))
      },
      config: {
        horarios: [],
        casillas: {
          entrada: Array(16).fill().map((_, i) => `Entrada ${i + 1}`),
          salida: Array(11).fill().map((_, i) => `Salida ${i + 1}`)
        }
      },
      historial: []
    };
    
    let turno = 'mañana';
    let sectorActual = 'entrada';
    
    parsedData.forEach(fila => {
      if (fila.length === 0 || (fila.length === 1 && !fila[0])) return;
      
      switch(fila[0]) {
        case 'version':
          // Verificar compatibilidad
          if (fila[1] !== '2.0') {
            console.warn('Versión de archivo no compatible');
          }
          break;
          
        case 'turno':
          turno = fila[1];
          break;
          
        case 'sector_actual':
          sectorActual = fila[1];
          break;
          
        case 'agente':
          if (fila[1] !== 'id') { // Skip header
            estado.agentes.push({
              id: fila[1],
              nombre: fila[2],
              apellido: fila[3],
              equipo: fila[4],
              color: fila[5],
              horas: 0
            });
          }
          break;
          
        case 'horarios':
          estado.config.horarios = fila.slice(1);
          break;
          
        case 'casillas_entrada':
          estado.config.casillas.entrada = fila.slice(1);
          break;
          
        case 'casillas_salida':
          estado.config.casillas.salida = fila.slice(1);
          break;
          
        case 'matriz_entrada':
          const filaEntrada = parseInt(fila[1]);
          estado.matrices.entrada[filaEntrada] = fila.slice(2).map(celda => celda || null);
          break;
          
        case 'matriz_salida':
          const filaSalida = parseInt(fila[1]);
          estado.matrices.salida[filaSalida] = fila.slice(2).map(celda => celda || null);
          break;
          
        case 'historial':
          if (fila[1]) {
            estado.historial = fila.slice(1).map(h => JSON.parse(h));
          }
          break;
      }
    });
    
    // Calcular horas para cada agente
    estado.agentes.forEach(agente => {
      agente.horas = contarHorasAgente(estado.matrices, agente.id);
    });
    
    callback(estado, turno, sectorActual);
  };
  
  reader.readAsText(file);
};

const contarHorasAgente = (matrices, agenteId) => {
  let horas = 0;
  
  Object.values(matrices).forEach(matriz => {
    matriz.forEach(fila => {
      fila.forEach(celda => {
        if (celda === agenteId) horas++;
      });
    });
  });
  
  return horas;
};
