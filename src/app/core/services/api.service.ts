import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

/**
 * Cliente HTTP genérico. Recebe endpoints relativos (ex.: `/dashboard/notas`);
 * a baseURL (`environment.apiUrl`) e o tratamento global de erro ficam no `apiInterceptor`.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  get<T>(endpoint: string, params?: Record<string, string | number | boolean>): Observable<T> {
    let httpParams = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          httpParams = httpParams.set(key, String(value));
        }
      });
    }
    return this.http.get<T>(endpoint, { params: httpParams });
  }

  post<T>(endpoint: string, body?: unknown): Observable<T> {
    return this.http.post<T>(endpoint, body);
  }

  patch<T>(endpoint: string, body?: unknown): Observable<T> {
    return this.http.patch<T>(endpoint, body);
  }

  put<T>(endpoint: string, body?: unknown): Observable<T> {
    return this.http.put<T>(endpoint, body);
  }

  delete<T>(endpoint: string): Observable<T> {
    return this.http.delete<T>(endpoint);
  }

  uploadFile<T>(endpoint: string, file: File, fieldName = 'file'): Observable<T> {
    const formData = new FormData();
    formData.append(fieldName, file);
    return this.http.post<T>(endpoint, formData);
  }
}
