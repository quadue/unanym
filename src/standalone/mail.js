import nodemailer from 'nodemailer';
import {readFileSync,statSync} from 'node:fs';

export function smtpMailer(path) {
  if(!path)throw new Error('IDENTITY_SMTP_FILE is required; codes are never printed to logs');
  if((statSync(path).mode&0o077)!==0)throw new Error('Restrict SMTP settings to their owner (chmod 600)');
  const c=JSON.parse(readFileSync(path,'utf8'));
  if(typeof c.host!=='string'||!c.host||!Number.isInteger(c.port)||c.port<1||c.port>65535||typeof c.from!=='string'||!c.from||/[\r\n]/.test(c.from)||!c.auth?.user||!c.auth?.pass)throw new Error('Invalid SMTP configuration');
  const transport=nodemailer.createTransport({host:c.host,port:c.port,secure:c.port===465,requireTLS:c.port!==465,auth:c.auth,
    connectionTimeout:10_000,greetingTimeout:10_000,socketTimeout:15_000,disableFileAccess:true,disableUrlAccess:true});
  return async({email,code})=>{
    const result=await transport.sendMail({from:c.from,to:email,subject:'Your sign-in code',text:`Your sign-in code is ${code}. It expires in 10 minutes. Only enter it on the sign-in page you opened. If you did not request this, ignore this message.`});
    if(!result.accepted?.length)throw new Error('Mail not accepted');
  };
}
