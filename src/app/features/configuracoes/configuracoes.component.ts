import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
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
import { ThemeService } from '../../core/services/theme.service';
import { UiCardComponent } from '../../shared/ui/ui-card.component';

@Component({
  selector: 'app-configuracoes',
  standalone: true,
  imports: [
    FormsModule,
    MatSlideToggleModule,
    UiCardComponent,
    LucideSettings,
    LucideUser,
    LucideLock,
    LucideSave,
    LucideEye,
    LucideEyeOff,
    LucideCheck,
    LucideMoon,
  ],
  templateUrl: './configuracoes.component.html',
})
export class ConfiguracoesComponent {
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
