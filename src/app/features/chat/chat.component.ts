import { Component, inject, signal, ElementRef, ViewChild, AfterViewChecked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgClass } from '@angular/common';
import {
  LucideMessageSquare,
  LucideSend,
  LucideBot,
  LucideUser,
  LucideHeadset,
  LucideX,
} from '@lucide/angular';
import { ChatService } from '../../core/services/chat.service';
import { ChatMessage } from '../../core/models/types';
import { LOGGED_PRODUCER_ID } from '../../core/services/dashboard.service';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [FormsModule, NgClass, LucideMessageSquare, LucideSend, LucideBot, LucideUser, LucideHeadset, LucideX],
  templateUrl: './chat.component.html',
})
export class ChatComponent implements AfterViewChecked {
  @ViewChild('endRef') endRef!: ElementRef<HTMLDivElement>;

  private readonly chatService = inject(ChatService);

  input = signal('');
  isLoading = signal(false);
  isTyping = signal(false);
  showHumano = signal(false);
  messages = signal<ChatMessage[]>([]);

  readonly perguntasRapidas = [
    'Como está minha situação financeira?',
    'Quais impostos devo pagar?',
    'Resumo do mês',
    'Como funciona o CBS?',
  ];

  ngAfterViewChecked(): void {
    try { this.endRef?.nativeElement?.scrollIntoView({ behavior: 'smooth' }); } catch { /* scroll best-effort */ }
  }

  enviar(texto?: string): void {
    const msg = (texto ?? this.input()).trim();
    if (!msg || this.isLoading()) return;

    this.input.set('');
    this.messages.update(list => [...list, { role: 'user', content: msg }]);
    this.isLoading.set(true);
    this.isTyping.set(true);

    this.chatService.enviarMensagem({
      produtorId: LOGGED_PRODUCER_ID,
      mensagem: msg,
      estado: 'PR',
      culturas: ['Soja', 'Milho'],
      regimeTributario: 'Simples Nacional',
    }).subscribe({
      next: res => {
        this.isTyping.set(false);
        this.isLoading.set(false);
        this.messages.update(list => [...list, { role: 'assistant', content: res.resposta }]);
      },
      error: () => {
        this.isTyping.set(false);
        this.isLoading.set(false);
        this.messages.update(list => [...list, {
          role: 'assistant',
          content: 'Desculpe, não consegui processar sua mensagem. Tente novamente.',
        }]);
      },
    });
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); this.enviar(); }
  }

  horaAtual(): string {
    return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
}
