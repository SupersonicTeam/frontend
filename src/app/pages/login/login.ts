import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideSprout, LucideUser, LucideCalculator, LucideArrowRight } from '@lucide/angular';
import { PerfilService, Perfil } from '@core/services/perfil.service';

/**
 * Login demonstrativo (issue #23) — sem autenticação/validação. Apenas seleciona
 * o perfil (produtor/contador) para separar as experiências na apresentação.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, LucideSprout, LucideUser, LucideCalculator, LucideArrowRight],
  templateUrl: './login.html',
})
export class LoginPage {
  private readonly perfilService = inject(PerfilService);
  private readonly router = inject(Router);

  nome = signal('');

  entrar(perfil: Perfil): void {
    this.perfilService.entrar(perfil, this.nome());
    this.router.navigateByUrl(this.perfilService.homeDoPerfil());
  }
}
