import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { apiInterceptor } from './api.interceptor';
import { skipErrorNotify } from './error-notify.context';
import { ToastService } from '@core/services/toast.service';

describe('apiInterceptor (toast global de erro)', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let toast: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiInterceptor])),
        provideHttpClientTesting(),
        ToastService,
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
  });

  afterEach(() => httpMock.verify());

  it('exibe toast amigável (do ApiError) em endpoint não tratado localmente', () => {
    http.get('/apuracao').subscribe({ next: () => undefined, error: () => undefined });
    httpMock.expectOne('/api/apuracao').flush(
      { message: 'Falha', errors: [{ code: 'X', message: 'Período inválido' }] },
      { status: 500, statusText: 'Server Error' },
    );
    const toasts = toast.toasts();
    expect(toasts.length).toBe(1);
    expect(toasts[0].type).toBe('error');
    expect(toasts[0].message).toBe('Período inválido');
  });

  it('NÃO exibe toast para /api/notas (tratado localmente com painéis próprios)', () => {
    http.get('/notas').subscribe({ next: () => undefined, error: () => undefined });
    httpMock.expectOne('/api/notas').flush({ message: 'x' }, { status: 500, statusText: 'x' });
    expect(toast.toasts().length).toBe(0);
  });

  it('respeita skipErrorNotify() na requisição', () => {
    http.get('/apuracao', { context: skipErrorNotify() }).subscribe({ next: () => undefined, error: () => undefined });
    httpMock.expectOne('/api/apuracao').flush({ message: 'x' }, { status: 500, statusText: 'x' });
    expect(toast.toasts().length).toBe(0);
  });

  it('não exibe toast em 404 (endpoint ainda inexistente)', () => {
    http.get('/relatorios/conformidade').subscribe({ next: () => undefined, error: () => undefined });
    httpMock.expectOne('/api/relatorios/conformidade').flush({}, { status: 404, statusText: 'Not Found' });
    expect(toast.toasts().length).toBe(0);
  });
});
