import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  get<T>(endpoint: string, params?: Record<string, string | number | boolean>): Observable<T> {
    let httpParams = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          httpParams = httpParams.set(key, String(value));
        }
      });
    }
    return this.http.get<T>(`${this.baseUrl}${endpoint}`, { params: httpParams }).pipe(
      catchError(err => {
        if (err.status !== 404) console.error('API Error:', err);
        return throwError(() => err);
      })
    );
  }

  post<T>(endpoint: string, body?: unknown): Observable<T> {
    return this.http.post<T>(`${this.baseUrl}${endpoint}`, body).pipe(
      catchError(err => throwError(() => err))
    );
  }

  patch<T>(endpoint: string, body?: unknown): Observable<T> {
    return this.http.patch<T>(`${this.baseUrl}${endpoint}`, body).pipe(
      catchError(err => throwError(() => err))
    );
  }

  put<T>(endpoint: string, body?: unknown): Observable<T> {
    return this.http.put<T>(`${this.baseUrl}${endpoint}`, body).pipe(
      catchError(err => throwError(() => err))
    );
  }

  delete<T>(endpoint: string): Observable<T> {
    return this.http.delete<T>(`${this.baseUrl}${endpoint}`).pipe(
      catchError(err => throwError(() => err))
    );
  }

  uploadFile<T>(endpoint: string, file: File, fieldName = 'file'): Observable<T> {
    const formData = new FormData();
    formData.append(fieldName, file);
    return this.http.post<T>(`${this.baseUrl}${endpoint}`, formData).pipe(
      catchError(err => throwError(() => err))
    );
  }
}
