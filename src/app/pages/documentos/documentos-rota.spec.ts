import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DocumentosRotaPage } from './documentos-rota';
import { entrarComo } from '@core/services/sessao.testing';

@Component({ selector: 'app-documentos', standalone: true, template: 'tela do produtor' })
class DocumentosFalso {}

@Component({ selector: 'app-notas-contador', standalone: true, template: 'tela do contador' })
class NotasContadorFalso {}

/**
 * `/documentos` escolhe a tela pelo papel (issue #136).
 *
 * O contador abria a tela do produtor e levava 403 em `/api/notas`, `/api/vinculos` e
 * `/api/pendencias`. E o produtor não pode perceber diferença nenhuma: a tela dele continua a mesma.
 * As duas telas entram como falsas porque o que está em jogo aqui é a escolha, não o conteúdo.
 */
describe('DocumentosRotaPage', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    TestBed.overrideComponent(DocumentosRotaPage, {
      set: { imports: [DocumentosFalso, NotasContadorFalso] },
    });
  });

  afterEach(() => localStorage.clear());

  function texto(): string {
    const fixture = TestBed.createComponent(DocumentosRotaPage);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  it('o produtor continua na tela dele', () => {
    entrarComo('PRODUTOR');
    expect(texto()).toContain('tela do produtor');
    expect(texto()).not.toContain('tela do contador');
  });

  it('o contador vai para as notas de um cliente, nunca para a tela do produtor', () => {
    entrarComo('CONTADOR');
    expect(texto()).toContain('tela do contador');
    expect(texto()).not.toContain('tela do produtor');
  });
});
