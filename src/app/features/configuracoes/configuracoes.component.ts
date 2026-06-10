import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideSettings,
  LucideUser,
  LucideLock,
  LucideSave,
  LucideEye,
  LucideEyeOff,
  LucideCheck,
} from '@lucide/angular';

@Component({
  selector: 'app-configuracoes',
  standalone: true,
  imports: [FormsModule, LucideSettings, LucideUser, LucideLock, LucideSave, LucideEye, LucideEyeOff, LucideCheck],
  templateUrl: './configuracoes.component.html',
})
export class ConfiguracoesComponent {
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
