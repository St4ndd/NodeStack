
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { X, CheckCircle, AlertTriangle, Info, AlertOctagon } from 'lucide-react';
import { Button } from './Button';

// --- Types ---
type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary';
}

interface UIContextType {
  toast: {
    success: (title: string, message?: string) => void;
    error: (title: string, message?: string) => void;
    info: (title: string, message?: string) => void;
    warning: (title: string, message?: string) => void;
  };
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const UIContext = createContext<UIContextType | null>(null);

export const useUI = () => {
  const context = useContext(UIContext);
  if (!context) throw new Error("useUI must be used within UIProvider");
  return context;
};

// --- Components ---

const ToastItem: React.FC<{ toast: Toast; onClose: (id: string) => void }> = ({ toast, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => onClose(toast.id), 5000);
    return () => clearTimeout(timer);
  }, [toast.id, onClose]);

  const icons = {
    success: <CheckCircle className="w-5 h-5 text-emerald-500" />,
    error: <AlertOctagon className="w-5 h-5 text-red-500" />,
    warning: <AlertTriangle className="w-5 h-5 text-yellow-500" />,
    info: <Info className="w-5 h-5 text-blue-500" />
  };

  const borders = {
    success: 'border-emerald-500/20 bg-emerald-900/10',
    error: 'border-red-500/20 bg-red-900/10',
    warning: 'border-yellow-500/20 bg-yellow-900/10',
    info: 'border-blue-500/20 bg-blue-900/10'
  };

  return (
    <div className={`flex gap-3 p-4 rounded-lg border backdrop-blur-md shadow-xl animate-slide-in min-w-[300px] max-w-md pointer-events-auto ${borders[toast.type]}`}>
      <div className="shrink-0 mt-0.5">{icons[toast.type]}</div>
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-bold text-white">{toast.title}</h4>
        {toast.message && <p className="text-xs text-zinc-400 mt-1">{toast.message}</p>}
      </div>
      <button onClick={() => onClose(toast.id)} className="text-zinc-500 hover:text-white shrink-0 self-start">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export const UIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<{ isOpen: boolean; options: ConfirmOptions; resolve: (val: boolean) => void } | null>(null);

  const addToast = useCallback((type: ToastType, title: string, message?: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, type, title, message }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ isOpen: true, options, resolve });
    });
  }, []);

  const handleConfirmAction = (result: boolean) => {
    if (confirmState) {
      confirmState.resolve(result);
      setConfirmState(null);
    }
  };

  const toastMethods = {
    success: (t: string, m?: string) => addToast('success', t, m),
    error: (t: string, m?: string) => addToast('error', t, m),
    info: (t: string, m?: string) => addToast('info', t, m),
    warning: (t: string, m?: string) => addToast('warning', t, m),
  };

  return (
    <UIContext.Provider value={{ toast: toastMethods, confirm }}>
      {children}
      
      {/* Toast Container */}
      <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-3 pointer-events-none">
        {toasts.map(t => <ToastItem key={t.id} toast={t} onClose={removeToast} />)}
      </div>

      {/* Confirmation Modal */}
      {confirmState && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#18181b] border border-zinc-700 rounded-xl w-full max-w-md shadow-2xl p-6 transform transition-all scale-100">
             <div className="flex items-start gap-4 mb-4">
                <div className={`p-3 rounded-full ${confirmState.options.variant === 'danger' ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                   {confirmState.options.variant === 'danger' ? <AlertTriangle className="w-6 h-6" /> : <Info className="w-6 h-6" />}
                </div>
                <div>
                   <h3 className="text-lg font-bold text-white">{confirmState.options.title}</h3>
                   <p className="text-zinc-400 text-sm mt-1">{confirmState.options.message}</p>
                </div>
             </div>
             <div className="flex justify-end gap-3 mt-6">
                <Button variant="secondary" onClick={() => handleConfirmAction(false)}>
                   {confirmState.options.cancelText || 'Cancel'}
                </Button>
                <Button 
                  variant={confirmState.options.variant === 'danger' ? 'danger' : 'primary'} 
                  onClick={() => handleConfirmAction(true)}
                >
                   {confirmState.options.confirmText || 'Confirm'}
                </Button>
             </div>
          </div>
        </div>
      )}
    </UIContext.Provider>
  );
};
