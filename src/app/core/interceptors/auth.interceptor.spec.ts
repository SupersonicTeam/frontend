import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { authInterceptor } from './auth.interceptor';
import { TokenService } from '@core/services/token.service';

/** Stub configurável do TokenService para variar o token entre os testes. */
class FakeTokenService {
  token: string | null = null;
  getToken(): string | null {
    return this.token;
  }
}

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let tokens: FakeTokenService;

  beforeEach(() => {
    tokens = new FakeTokenService();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: TokenService, useValue: tokens },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('INT-07: sem token, não adiciona header Authorization (inócuo)', () => {
    tokens.token = null;
    http.get('/dashboard').subscribe();
    const req = httpMock.expectOne('/dashboard');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('INT-08: com token, adiciona Authorization: Bearer <token>', () => {
    tokens.token = 'abc.def.ghi';
    http.get('/dashboard').subscribe();
    const req = httpMock.expectOne('/dashboard');
    expect(req.request.headers.get('Authorization')).toBe('Bearer abc.def.ghi');
    req.flush({});
  });

  it('INT-07 (edge): token string vazia é tratado como sem token', () => {
    tokens.token = '';
    http.get('/dashboard').subscribe();
    const req = httpMock.expectOne('/dashboard');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });
});
