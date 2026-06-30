/** Um erro fiscal individual do envelope padronizado da API (backend Spring). */
export interface FiscalError {
  code: string;
  field: string;
  message: string;
  suggestion?: string;
  rejectedValue?: string;
  expectedValue?: string;
}

/** Envelope de erro padronizado de toda a API (ex.: 422 de POST /notas/:id/gerar-xml). */
export interface ApiErrorEnvelope {
  timestamp: string;
  status: number;
  error: string;
  message: string;
  path: string;
  errors: FiscalError[];
}
