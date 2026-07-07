import { filenameDeContentDisposition, apiErrorDeBlob } from './download';

describe('download util', () => {
  describe('filenameDeContentDisposition (INT-10/11)', () => {
    it('extrai o filename de um Content-Disposition attachment', () => {
      expect(
        filenameDeContentDisposition('attachment; filename="danfe-42.pdf"', 'fb.pdf'),
      ).toBe('danfe-42.pdf');
    });

    it('extrai filename sem aspas', () => {
      expect(
        filenameDeContentDisposition('attachment; filename=conformidade-2026-07.pdf', 'fb.pdf'),
      ).toBe('conformidade-2026-07.pdf');
    });

    it('header ausente (null) → fallback', () => {
      expect(filenameDeContentDisposition(null, 'fallback.pdf')).toBe('fallback.pdf');
    });

    it('apenas filename*= (RFC 5987) não decodificado → fallback', () => {
      expect(
        filenameDeContentDisposition("attachment; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf", 'fb.pdf'),
      ).toBe('fb.pdf');
    });
  });

  describe('apiErrorDeBlob (INT-12)', () => {
    it('desserializa um Blob de ApiError JSON em envelope', async () => {
      const envelope = {
        timestamp: '2026-07-07T10:00:00-03:00',
        status: 409,
        error: 'Conflict',
        message: 'DANFE indisponível',
        path: '/api/notas/1/pdf',
        errors: [{ code: 'DANFE_INDISPONIVEL', message: 'Gere o XML primeiro.' }],
      };
      const blob = new Blob([JSON.stringify(envelope)], { type: 'application/json' });
      const resultado = await apiErrorDeBlob(blob);
      expect(resultado?.errors[0].code).toBe('DANFE_INDISPONIVEL');
      expect(resultado?.message).toBe('DANFE indisponível');
    });

    it('Blob não-parseável (binário/texto) → null', async () => {
      const blob = new Blob(['%PDF-1.4 binário...'], { type: 'application/pdf' });
      expect(await apiErrorDeBlob(blob)).toBeNull();
    });
  });
});
