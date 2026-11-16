/**
 * Declarações de tipos para expo-mail-composer (Expo SDK 58).
 * Permite tipagem e verificação estática até que o pacote seja instalado nativamente via:
 * npx expo install expo-mail-composer
 */

declare module 'expo-mail-composer' {
  export type MailComposerStatus = 'sent' | 'saved' | 'cancelled' | 'undetermined';

  export interface MailComposerResult {
    status: MailComposerStatus;
  }

  export interface MailComposerOptions {
    recipients?: string[];
    ccRecipients?: string[];
    bccRecipients?: string[];
    subject?: string;
    body?: string;
    isHtml?: boolean;
    attachments?: string[];
  }

  export function composeAsync(options: MailComposerOptions): Promise<MailComposerResult>;
  export function isAvailableAsync(): Promise<boolean>;
}
