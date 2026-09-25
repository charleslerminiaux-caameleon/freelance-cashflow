import {test,expect,_electron as electron} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
test('native setup opens without Supabase configuration and rejects invalid input safely',async()=>{
 const app=await electron.launch({args:[fileURLToPath(new URL('harness.mjs',import.meta.url))],env:{...process.env,ELECTRON_DISABLE_SECURITY_WARNINGS:'true'}});
 try {
  const page=await app.firstWindow();
  await expect(page.getByRole('heading',{name:'Installons votre espace de travail.'})).toBeVisible();
  await expect(page.getByLabel('Clé secrète service_role')).toHaveAttribute('type','password');
  await page.getByLabel('URL du projet').fill('https://example.com');
  await page.getByLabel('Clé publique anon').fill('fake');
  await page.getByLabel('Clé secrète service_role').fill('fake');
  await page.getByLabel('Jeton personnel Supabase').fill('fake');
  await page.getByLabel('Mot de passe de la base').fill('fake');
  await page.getByRole('button',{name:'Vérifier mon installation'}).click();
  await expect(page.getByRole('status')).toContainText('Vérifiez l’URL');
  const screenshot=process.env.FC_DESKTOP_SCREENSHOT;
  if(screenshot)await page.screenshot({path:screenshot,fullPage:true});
 }finally{await app.close();}
});
