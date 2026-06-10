interface EmailActionCopy {
  subject: string;
  title: string;
  intro: string;
  button: string;
  footer: string;
  expiry?: string;
  warningLabel?: string;
  warning?: string;
  proceed?: string;
}

interface EmailCopy {
  greeting: (name: string) => string;
  copyUrl: string;
  confirmation: EmailActionCopy;
  passwordReset: EmailActionCopy;
  accountDeletion: EmailActionCopy;
}

interface RenderEmailOptions {
  title: string;
  titleColor?: string;
  greeting: string;
  intro: string;
  warning?: {
    label?: string;
    message?: string;
  };
  proceed?: string;
  url: string;
  buttonText: string;
  buttonColor?: string;
  copyUrl: string;
  expiry?: string;
  footer: string;
}

export interface EmailTemplates {
  confirmation: {
    subject: string;
    html: (name: string, confirmationUrl: string) => string;
  };
  passwordReset: {
    subject: string;
    html: (name: string, resetUrl: string) => string;
  };
  accountDeletion: {
    subject: string;
    html: (name: string, deletionUrl: string) => string;
  };
}

const emailCopies: Record<string, EmailCopy> = {
  en: {
    greeting: (name) => `Hello <strong>${name}</strong>,`,
    copyUrl: 'Or copy and paste this link in your browser:',
    confirmation: {
      subject: 'Confirm your email - Android App Starter',
      title: 'Welcome to Android App Starter! 🌟',
      intro: 'Thank you for registering! To complete your registration, click the button below to confirm your email:',
      button: 'Confirm Email',
      footer: 'If you didn\'t register for Android App Starter, you can ignore this email.'
    },
    passwordReset: {
      subject: 'Reset your password - Android App Starter',
      title: 'Reset your password 🔒',
      intro: 'We received a request to reset the password for your account.',
      button: 'Reset Password',
      expiry: 'This link expires in 1 hour.',
      footer: 'If you didn\'t request this reset, you can ignore this email. Your password will remain unchanged.'
    },
    accountDeletion: {
      subject: 'Confirm Account Deletion - Android App Starter',
      title: '⚠️ Account Deletion Request',
      intro: 'We received a request to permanently delete your Android App Starter account.',
      warningLabel: 'WARNING',
      warning: 'This action is irreversible! Your account and application data will be permanently deleted.',
      proceed: 'If you\'re sure you want to proceed, click the button below:',
      button: 'Confirm Account Deletion',
      expiry: 'This link expires in 1 hour for security reasons.',
      footer: 'If you didn\'t request this deletion, please ignore this email and consider changing your password. Your account will remain safe.'
    }
  },
  pt: {
    greeting: (name) => `Olá <strong>${name}</strong>,`,
    copyUrl: 'Ou copie e cole este link no seu navegador:',
    confirmation: {
      subject: 'Confirme seu email - Android App Starter',
      title: 'Bem-vindo ao Android App Starter! 🌟',
      intro: 'Obrigado por se cadastrar! Para completar seu registro, clique no botão abaixo para confirmar seu email:',
      button: 'Confirmar Email',
      footer: 'Se você não se cadastrou no Android App Starter, pode ignorar este email.'
    },
    passwordReset: {
      subject: 'Redefinir senha - Android App Starter',
      title: 'Redefinir sua senha 🔒',
      intro: 'Recebemos uma solicitação para redefinir a senha da sua conta.',
      button: 'Redefinir Senha',
      expiry: 'Este link expira em 1 hora.',
      footer: 'Se você não solicitou esta redefinição, pode ignorar este email. Sua senha permanecerá inalterada.'
    },
    accountDeletion: {
      subject: 'Confirmar Exclusão de Conta - Android App Starter',
      title: '⚠️ Solicitação de Exclusão de Conta',
      intro: 'Recebemos uma solicitação para excluir permanentemente sua conta do Android App Starter.',
      warningLabel: 'ATENÇÃO',
      warning: 'Esta ação é irreversível! Sua conta e os dados do aplicativo serão excluídos permanentemente.',
      proceed: 'Se você tem certeza de que deseja prosseguir, clique no botão abaixo:',
      button: 'Confirmar Exclusão da Conta',
      expiry: 'Este link expira em 1 hora por motivos de segurança.',
      footer: 'Se você não solicitou esta exclusão, ignore este email e considere alterar sua senha. Sua conta permanecerá segura.'
    }
  },
  es: {
    greeting: (name) => `Hola <strong>${name}</strong>,`,
    copyUrl: 'O copia y pega este enlace en tu navegador:',
    confirmation: {
      subject: 'Confirma tu email - Android App Starter',
      title: '¡Bienvenido a Android App Starter! 🌟',
      intro: '¡Gracias por registrarte! Para completar tu registro, haz clic en el botón de abajo para confirmar tu email:',
      button: 'Confirmar Email',
      footer: 'Si no te registraste en Android App Starter, puedes ignorar este email.'
    },
    passwordReset: {
      subject: 'Restablecer contraseña - Android App Starter',
      title: 'Restablecer tu contraseña 🔒',
      intro: 'Recibimos una solicitud para restablecer la contraseña de tu cuenta.',
      button: 'Restablecer Contraseña',
      expiry: 'Este enlace expira en 1 hora.',
      footer: 'Si no solicitaste este restablecimiento, puedes ignorar este email. Tu contraseña permanecerá sin cambios.'
    },
    accountDeletion: {
      subject: 'Confirmar Eliminación de Cuenta - Android App Starter',
      title: '⚠️ Solicitud de Eliminación de Cuenta',
      intro: 'Recibimos una solicitud para eliminar permanentemente tu cuenta de Android App Starter.',
      warningLabel: 'ADVERTENCIA',
      warning: '¡Esta acción es irreversible! Tu cuenta y los datos de la aplicación serán eliminados permanentemente.',
      proceed: 'Si estás seguro de que quieres proceder, haz clic en el botón de abajo:',
      button: 'Confirmar Eliminación de Cuenta',
      expiry: 'Este enlace expira en 1 hora por razones de seguridad.',
      footer: 'Si no solicitaste esta eliminación, ignora este email y considera cambiar tu contraseña. Tu cuenta permanecerá segura.'
    }
  },
  de: {
    greeting: (name) => `Hallo <strong>${name}</strong>,`,
    copyUrl: 'Oder kopiere und füge diesen Link in deinen Browser ein:',
    confirmation: {
      subject: 'Bestätige deine E-Mail - Android App Starter',
      title: 'Willkommen bei Android App Starter! 🌟',
      intro: 'Vielen Dank für deine Registrierung! Um deine Registrierung abzuschließen, klicke auf den Button unten, um deine E-Mail zu bestätigen:',
      button: 'E-Mail bestätigen',
      footer: 'Falls du dich nicht bei Android App Starter registriert hast, kannst du diese E-Mail ignorieren.'
    },
    passwordReset: {
      subject: 'Passwort zurücksetzen - Android App Starter',
      title: 'Dein Passwort zurücksetzen 🔒',
      intro: 'Wir haben eine Anfrage erhalten, dein Passwort zurückzusetzen.',
      button: 'Passwort zurücksetzen',
      expiry: 'Dieser Link läuft in 1 Stunde ab.',
      footer: 'Falls du diese Zurücksetzung nicht angefordert hast, kannst du diese E-Mail ignorieren. Dein Passwort bleibt unverändert.'
    },
    accountDeletion: {
      subject: 'Kontolöschung bestätigen - Android App Starter',
      title: '⚠️ Anfrage zur Kontolöschung',
      intro: 'Wir haben eine Anfrage erhalten, dein Android App Starter Konto permanent zu löschen.',
      warningLabel: 'WARNUNG',
      warning: 'Diese Aktion ist irreversibel! Dein Konto und deine App-Daten werden permanent gelöscht.',
      proceed: 'Wenn du sicher bist, dass du fortfahren möchtest, klicke auf den Button unten:',
      button: 'Kontolöschung bestätigen',
      expiry: 'Dieser Link läuft aus Sicherheitsgründen in 1 Stunde ab.',
      footer: 'Falls du diese Löschung nicht angefordert hast, ignoriere diese E-Mail und erwäge, dein Passwort zu ändern. Dein Konto bleibt sicher.'
    }
  },
  ja: {
    greeting: (name) => `こんにちは <strong>${name}</strong>さん、`,
    copyUrl: 'または、このリンクをコピーしてブラウザに貼り付けてください:',
    confirmation: {
      subject: 'メールアドレスを確認してください - Android App Starter',
      title: 'Android App Starterへようこそ！ 🌟',
      intro: 'ご登録ありがとうございます！登録を完了するには、下のボタンをクリックしてメールアドレスを確認してください:',
      button: 'メールを確認',
      footer: 'Android App Starterに登録していない場合は、このメールを無視してください。'
    },
    passwordReset: {
      subject: 'パスワードをリセット - Android App Starter',
      title: 'パスワードをリセット 🔒',
      intro: 'アカウントのパスワードリセットリクエストを受け取りました。',
      button: 'パスワードをリセット',
      expiry: 'このリンクは1時間で期限切れになります。',
      footer: 'このリセットをリクエストしていない場合は、このメールを無視してください。パスワードは変更されません。'
    },
    accountDeletion: {
      subject: 'アカウント削除の確認 - Android App Starter',
      title: '⚠️ アカウント削除リクエスト',
      intro: 'Android App Starterアカウントを完全に削除するリクエストを受け取りました。',
      warningLabel: '警告',
      warning: 'この操作は元に戻せません！アカウントとアプリデータが完全に削除されます。',
      proceed: '続行してよい場合は、下のボタンをクリックしてください:',
      button: 'アカウント削除を確認',
      expiry: 'セキュリティ上の理由により、このリンクは1時間で期限切れになります。',
      footer: 'この削除をリクエストしていない場合は、このメールを無視し、パスワードの変更を検討してください。アカウントは安全なままです。'
    }
  },
  zh: {
    greeting: (name) => `你好 <strong>${name}</strong>，`,
    copyUrl: '或者复制并粘贴此链接到浏览器中:',
    confirmation: {
      subject: '确认你的邮箱 - Android App Starter',
      title: '欢迎来到 Android App Starter！🌟',
      intro: '感谢注册！要完成注册，请点击下面的按钮确认你的邮箱:',
      button: '确认邮箱',
      footer: '如果你没有注册 Android App Starter，可以忽略这封邮件。'
    },
    passwordReset: {
      subject: '重置你的密码 - Android App Starter',
      title: '重置你的密码 🔒',
      intro: '我们收到了重置你账户密码的请求。',
      button: '重置密码',
      expiry: '此链接将在1小时后过期。',
      footer: '如果你没有请求重置密码，可以忽略这封邮件。你的密码不会被更改。'
    },
    accountDeletion: {
      subject: '确认删除账户 - Android App Starter',
      title: '⚠️ 账户删除请求',
      intro: '我们收到了永久删除你的 Android App Starter 账户的请求。',
      warningLabel: '警告',
      warning: '此操作无法撤销！你的账户和应用数据都将被永久删除。',
      proceed: '如果你确定要继续，请点击下面的按钮:',
      button: '确认删除账户',
      expiry: '出于安全原因，此链接将在1小时后过期。',
      footer: '如果你没有请求删除账户，请忽略这封邮件，并考虑更改密码。你的账户仍然安全。'
    }
  },
  ko: {
    greeting: (name) => `안녕하세요 <strong>${name}</strong>님,`,
    copyUrl: '또는 이 링크를 복사해 브라우저에 붙여넣으세요:',
    confirmation: {
      subject: '이메일을 확인하세요 - Android App Starter',
      title: 'Android App Starter에 오신 것을 환영합니다! 🌟',
      intro: '가입해 주셔서 감사합니다! 가입을 완료하려면 아래 버튼을 눌러 이메일을 확인하세요:',
      button: '이메일 확인',
      footer: 'Android App Starter에 가입하지 않았다면 이 이메일을 무시해도 됩니다.'
    },
    passwordReset: {
      subject: '비밀번호 재설정 - Android App Starter',
      title: '비밀번호 재설정 🔒',
      intro: '계정 비밀번호 재설정 요청을 받았습니다.',
      button: '비밀번호 재설정',
      expiry: '이 링크는 1시간 후 만료됩니다.',
      footer: '이 재설정을 요청하지 않았다면 이 이메일을 무시해도 됩니다. 비밀번호는 변경되지 않습니다.'
    },
    accountDeletion: {
      subject: '계정 삭제 확인 - Android App Starter',
      title: '⚠️ 계정 삭제 요청',
      intro: 'Android App Starter 계정을 영구적으로 삭제하라는 요청을 받았습니다.',
      warningLabel: '경고',
      warning: '이 작업은 되돌릴 수 없습니다! 계정과 앱 데이터가 영구적으로 삭제됩니다.',
      proceed: '계속 진행하려면 아래 버튼을 클릭하세요:',
      button: '계정 삭제 확인',
      expiry: '보안을 위해 이 링크는 1시간 후 만료됩니다.',
      footer: '이 삭제를 요청하지 않았다면 이 이메일을 무시하고 비밀번호 변경을 고려하세요. 계정은 안전하게 유지됩니다.'
    }
  },
  it: {
    greeting: (name) => `Ciao <strong>${name}</strong>,`,
    copyUrl: 'Oppure copia e incolla questo link nel browser:',
    confirmation: {
      subject: 'Conferma la tua email - Android App Starter',
      title: 'Benvenuto in Android App Starter! 🌟',
      intro: 'Grazie per esserti registrato! Per completare la registrazione, clicca sul pulsante qui sotto per confermare la tua email:',
      button: 'Conferma Email',
      footer: 'Se non ti sei registrato a Android App Starter, puoi ignorare questa email.'
    },
    passwordReset: {
      subject: 'Reimposta la password - Android App Starter',
      title: 'Reimposta la tua password 🔒',
      intro: 'Abbiamo ricevuto una richiesta per reimpostare la password del tuo account.',
      button: 'Reimposta Password',
      expiry: 'Questo link scade tra 1 ora.',
      footer: 'Se non hai richiesto questa reimpostazione, puoi ignorare questa email. La tua password resterà invariata.'
    },
    accountDeletion: {
      subject: 'Conferma eliminazione account - Android App Starter',
      title: '⚠️ Richiesta di eliminazione account',
      intro: 'Abbiamo ricevuto una richiesta per eliminare definitivamente il tuo account Android App Starter.',
      warningLabel: 'ATTENZIONE',
      warning: 'Questa azione è irreversibile! Il tuo account e i dati dell’app saranno eliminati definitivamente.',
      proceed: 'Se sei sicuro di voler procedere, clicca sul pulsante qui sotto:',
      button: 'Conferma eliminazione account',
      expiry: 'Questo link scade tra 1 ora per motivi di sicurezza.',
      footer: 'Se non hai richiesto questa eliminazione, ignora questa email e valuta di cambiare la password. Il tuo account resterà al sicuro.'
    }
  },
  fr: {
    greeting: (name) => `Bonjour <strong>${name}</strong>,`,
    copyUrl: 'Ou copiez et collez ce lien dans votre navigateur:',
    confirmation: {
      subject: 'Confirmez votre email - Android App Starter',
      title: 'Bienvenue sur Android App Starter ! 🌟',
      intro: 'Merci pour votre inscription ! Pour terminer votre inscription, cliquez sur le bouton ci-dessous afin de confirmer votre email:',
      button: 'Confirmer l\'email',
      footer: 'Si vous ne vous êtes pas inscrit à Android App Starter, vous pouvez ignorer cet email.'
    },
    passwordReset: {
      subject: 'Réinitialiser votre mot de passe - Android App Starter',
      title: 'Réinitialiser votre mot de passe 🔒',
      intro: 'Nous avons reçu une demande de réinitialisation du mot de passe de votre compte.',
      button: 'Réinitialiser le mot de passe',
      expiry: 'Ce lien expire dans 1 heure.',
      footer: 'Si vous n\'avez pas demandé cette réinitialisation, vous pouvez ignorer cet email. Votre mot de passe restera inchangé.'
    },
    accountDeletion: {
      subject: 'Confirmer la suppression du compte - Android App Starter',
      title: '⚠️ Demande de suppression de compte',
      intro: 'Nous avons reçu une demande de suppression définitive de votre compte Android App Starter.',
      warningLabel: 'AVERTISSEMENT',
      warning: 'Cette action est irréversible ! Votre compte et les données de l’application seront définitivement supprimés.',
      proceed: 'Si vous êtes sûr de vouloir continuer, cliquez sur le bouton ci-dessous:',
      button: 'Confirmer la suppression du compte',
      expiry: 'Ce lien expire dans 1 heure pour des raisons de sécurité.',
      footer: 'Si vous n\'avez pas demandé cette suppression, ignorez cet email et envisagez de changer votre mot de passe. Votre compte restera sécurisé.'
    }
  }
};

const renderEmail = ({
  title,
  titleColor = '#3880ff',
  greeting,
  intro,
  warning,
  proceed,
  url,
  buttonText,
  buttonColor = '#3880ff',
  copyUrl,
  expiry,
  footer
}: RenderEmailOptions): string => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2 style="color: ${titleColor};">${title}</h2>
    <p>${greeting}</p>
    <p>${intro}</p>

    ${warning ? `
      <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0; color: #856404;"><strong>⚠️ ${warning.label}:</strong> ${warning.message}</p>
      </div>
    ` : ''}

    ${proceed ? `<p>${proceed}</p>` : ''}

    <div style="text-align: center; margin: 30px 0;">
      <a href="${url}"
         style="background-color: ${buttonColor}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; display: inline-block;">
        ${buttonText}
      </a>
    </div>

    <p>${copyUrl}</p>
    <p style="word-break: break-all; color: #666;">${url}</p>

    ${expiry ? `<p><strong>${expiry}</strong></p>` : ''}

    <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
    <p style="color: #666; font-size: 12px;">
      ${footer}
    </p>
  </div>
`;

const createTemplates = (copy: EmailCopy): EmailTemplates => ({
  confirmation: {
    subject: copy.confirmation.subject,
    html: (name, confirmationUrl) => renderEmail({
      title: copy.confirmation.title,
      greeting: copy.greeting(name),
      intro: copy.confirmation.intro,
      url: confirmationUrl,
      buttonText: copy.confirmation.button,
      copyUrl: copy.copyUrl,
      footer: copy.confirmation.footer
    })
  },
  passwordReset: {
    subject: copy.passwordReset.subject,
    html: (name, resetUrl) => renderEmail({
      title: copy.passwordReset.title,
      greeting: copy.greeting(name),
      intro: copy.passwordReset.intro,
      url: resetUrl,
      buttonText: copy.passwordReset.button,
      copyUrl: copy.copyUrl,
      expiry: copy.passwordReset.expiry,
      footer: copy.passwordReset.footer
    })
  },
  accountDeletion: {
    subject: copy.accountDeletion.subject,
    html: (name, deletionUrl) => renderEmail({
      title: copy.accountDeletion.title,
      titleColor: '#e74c3c',
      greeting: copy.greeting(name),
      intro: copy.accountDeletion.intro,
      warning: {
        label: copy.accountDeletion.warningLabel,
        message: copy.accountDeletion.warning
      },
      proceed: copy.accountDeletion.proceed,
      url: deletionUrl,
      buttonText: copy.accountDeletion.button,
      buttonColor: '#e74c3c',
      copyUrl: copy.copyUrl,
      expiry: copy.accountDeletion.expiry,
      footer: copy.accountDeletion.footer
    })
  }
});

const emailTemplates: Record<string, EmailTemplates> = Object.fromEntries(
  Object.entries(emailCopies).map(([language, copy]) => [language, createTemplates(copy)])
);

export const supportedEmailTemplateLanguages = Object.freeze(Object.keys(emailCopies));
export const fallbackEmailTemplates = emailTemplates.en;

export default emailTemplates;
