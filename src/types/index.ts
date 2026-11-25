export interface Ponto {
  id: string;
  bairro: string;
  ponto: string;
  latitude: number;
  longitude: number;
  status?: 'normal' | 'atencao' | 'vermelho';
  ts?: string;
}

export interface Alerta {
  id: string;
  ts: string;
  nivel: 'verde' | 'amarelo' | 'vermelho';
  bairro: string;
  descricao: string;
}

export interface Relato {
  id: string;
  ts: string;
  bairro: string;
  tipo: string;
  descricao: string;
  foto?: string;
}

export interface WeatherData {
  provider: string;
  location: string;
  observedAt: string;
  fetchedAt: string;
  rainMm: number;
  next6hMaxRainMm: number;
  next6hMaxProbability: number;
  status: 'normal' | 'atencao' | 'vermelho';
  message: string;
  disclaimer: string;
}

export interface StatusResponse {
  pontos: Ponto[];
  alertas: Alerta[];
  relatos: Relato[];
  leiturasPorPonto: Record<string, LeituraPonto>;
}

export interface LeituraPonto {
  estacao: string;
  fonte: string;
  coletadoEm: string;
  precipitacaoMm: number;
  nivelRioCm: number | null;
  desatualizada: boolean;
}
