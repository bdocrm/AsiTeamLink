// Email templates helper — confirmation email
export type ConfirmationData = {
  firstName?: string;
  companyName?: string;
  verificationLink: string;
  supportEmail?: string;
  expires?: string; // human-readable expiry, e.g. '24 hours'
};

export function confirmationEmail(data: ConfirmationData) {
  const {
      firstName = 'User',
      companyName = 'Allianz Synergia',
      verificationLink,
      supportEmail = 'support@allianz-synergia.com',
      expires = '24 hours',
  } = data;

    const subject = 'Action required — please confirm your email address';

    const text = `Dear ${firstName},

  Welcome to ${companyName}.

  To complete your registration and verify your email address, please click the link below:

  ${verificationLink}

  This link will expire in ${expires}. If you did not request this verification, you may safely ignore this message or contact our Support team at ${supportEmail}.

  Sincerely,
  The ${companyName} Team`;

    const html = `<p>Dear ${firstName},</p>
  <p>Welcome to <strong>${companyName}</strong>. To complete your registration and verify your email address, please click the button below:</p>
  <p style="text-align:center;"><a href="${verificationLink}" style="display:inline-block;padding:12px 20px;background:#004a9f;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Confirm Your Email</a></p>
  <p>This link will expire in ${expires}. If you did not request this verification, you may ignore this message or contact our Support team at <a href="mailto:${supportEmail}">${supportEmail}</a>.</p>
  <p>Sincerely,<br/>The ${companyName} Team</p>`;

  return { subject, text, html };
}

export default confirmationEmail;

// Usage example:
// const mail = confirmationEmail({ firstName: 'Alice', companyName: 'Acme', verificationLink: 'https://...', supportEmail: 'help@acme.com' });
// sendMail({ to: user.email, subject: mail.subject, text: mail.text, html: mail.html });
