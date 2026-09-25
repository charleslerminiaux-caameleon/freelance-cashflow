import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { DirectIntegrationCard } from './direct-panel';
it('does not claim a configured integration is connected before first successful sync',()=>{
 render(<DirectIntegrationCard provider="pennylane" configured integration={null} action={vi.fn()} />);
 expect(screen.getByText('À synchroniser')).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Synchroniser Pennylane'})).toBeEnabled();
});
it('disables unconfigured bank and links to its setup requirements',()=>{
 render(<DirectIntegrationCard provider="revolut" configured={false} integration={null} action={vi.fn()} />);
 expect(screen.getByRole('button',{name:'Synchroniser Revolut Business'})).toBeDisabled();
 expect(screen.getByRole('link',{name:/Configurer/})).toHaveAttribute('href','/integrations/setup#revolut');
});
it('shows a synchronization result',async()=>{
 render(<DirectIntegrationCard provider="bunq" configured integration={null} action={async()=>({success:true,message:'Données publiées.'})} />);
 fireEvent.click(screen.getByRole('button',{name:'Synchroniser bunq'}));
 expect(await screen.findByRole('status')).toHaveTextContent('Données publiées.');
});
