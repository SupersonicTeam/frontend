import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideSettings,
  LucideUser,
  LucideLock,
  LucideSave,
  LucideEye,
  LucideEyeOff,
  LucideCheck,
  LucideMoon,
} from '@lucide/angular';
import { ThemeService } from '@core/services/theme.service';
import { UiCard } from '@shared/ui/ui-card';

@Component({
  selector: 'app-configuracoes',
  standalone: true,
  imports: [
    FormsModule,
    UiCard,
    LucideSettings,
    LucideUser,
    LucideLock,
    LucideSave,
    LucideEye,
    LucideEyeOff,
    LucideCheck,
    LucideMoon,
  ],
  templateUrl: './configuracoes.html',
})
export class ConfiguracoesPage {
  readonly themeService = inject(ThemeService);
  showSenha = signal(false);
  showNovaSenha = signal(false);
  salvando = signal(false);
  salvoSucesso = signal(false);
  nome = signal('João Silva');
  email = signal('joao.silva@fazenda.com');
  senhaAtual = signal('');
  novaSenha = signal('');
  confirmarSenha = signal('');
  alterarSenha = signal(false);

  salvarPerfil(): void {
    this.salvando.set(true);
    setTimeout(() => {
      this.salvando.set(false);
      this.salvoSucesso.set(true);
      setTimeout(() => this.salvoSucesso.set(false), 3000);
    }, 1200);
  }
}
