import { Component } from '@angular/core';
import { LucideReceipt } from '@lucide/angular';

/**
 * Tela Tributário (issue #27) — Apuração mensal de IBS/CBS, saldo de créditos e relatório de
 * conformidade do período, consumindo `TributarioApi`. Stub inicial (T11); as seções são
 * preenchidas em T12–T14.
 */
@Component({
  selector: 'app-tributario',
  standalone: true,
  imports: [LucideReceipt],
  templateUrl: './tributario.html',
})
export class TributarioPage {}
