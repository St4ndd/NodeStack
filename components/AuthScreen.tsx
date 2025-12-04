
import React, { useState } from 'react';
import { Lock, Key, ArrowRight, ShieldCheck, Server } from 'lucide-react';
import { Button } from './Button';

interface AuthScreenProps {
    mode: 'login' | 'setup';
    onSuccess: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ mode, onSuccess }) => {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const endpoint = mode === 'setup' ? '/api/auth/setup' : '/api/auth/login';
        
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });

            if (res.ok) {
                onSuccess();
            } else {
                const data = await res.json();
                setError(data.error || 'Authentication failed');
            }
        } catch (e) {
            setError('Connection failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0f0f12] flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-[#18181b] border border-zinc-800 rounded-2xl shadow-2xl p-8 relative overflow-hidden">
                {/* Background Decoration */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-blue-500"></div>
                <div className="absolute -top-10 -right-10 w-40 h-40 bg-emerald-500/5 rounded-full blur-3xl"></div>
                
                <div className="flex flex-col items-center mb-8 relative z-10">
                    <div className="w-16 h-16 bg-zinc-900 rounded-2xl flex items-center justify-center mb-6 shadow-inner border border-zinc-800">
                        {mode === 'setup' ? <ShieldCheck className="w-8 h-8 text-emerald-500" /> : <Lock className="w-8 h-8 text-emerald-500" />}
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">
                        {mode === 'setup' ? 'Setup Security' : 'Welcome Back'}
                    </h1>
                    <p className="text-zinc-500 text-center text-sm">
                        {mode === 'setup' 
                            ? 'Create a password to protect your NodeStack dashboard.' 
                            : 'Please enter your password to access the dashboard.'}
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">Password</label>
                        <div className="relative">
                            <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-600" />
                            <input 
                                type="password" 
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 outline-none transition-all placeholder:text-zinc-700"
                                placeholder="Enter password..."
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                autoFocus
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs text-center font-medium animate-pulse">
                            {error}
                        </div>
                    )}

                    <Button className="w-full h-12 text-base shadow-lg shadow-emerald-900/20" isLoading={loading}>
                        {mode === 'setup' ? 'Set Password' : 'Login'} <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                </form>

                <div className="mt-8 pt-6 border-t border-zinc-800 text-center">
                    <div className="flex items-center justify-center gap-2 text-zinc-600 text-xs font-mono">
                        <Server className="w-3 h-3" />
                        <span>NodeStack Local Dashboard</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
