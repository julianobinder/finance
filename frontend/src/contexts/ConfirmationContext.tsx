import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Dialog } from '@gravity-ui/uikit';
import { notifications } from '@/utils/notifications';

interface ConfirmOptions {
  title: string;
  content?: string;
  onOk?: () => void | Promise<void>;
  onCancel?: () => void;
  okText?: string;
  cancelText?: string;
}

interface ConfirmationContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmationContext = createContext<ConfirmationContextType | null>(null);

export const useConfirmation = () => {
  const context = useContext(ConfirmationContext);
  if (!context) {
    throw new Error('useConfirmation must be used within a ConfirmationProvider');
  }
  return context;
};

interface ConfirmationProviderProps {
  children: ReactNode;
}

export const ConfirmationProvider: React.FC<ConfirmationProviderProps> = ({ children }) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [resolveRef, setResolveRef] = useState<{ resolve: (value: boolean) => void } | null>(null);

  const confirm = (opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setOptions(opts);
      setResolveRef({ resolve });
      setIsOpen(true);
    });
  };

  useEffect(() => {
    notifications.registerConfirmHandler(confirm);
    return () => {
      notifications.unregisterConfirmHandler();
    };
  }, []);

  const handleCancel = () => {
    setIsOpen(false);
    if (options?.onCancel) {
      options.onCancel();
    }
    if (resolveRef) {
      resolveRef.resolve(false);
    }
  };

  const handleConfirm = async () => {
    setIsOpen(false);
    if (options?.onOk) {
      try {
        await options.onOk();
      } catch (error) {
        console.error('Error executing confirmation onOk:', error);
      }
    }
    if (resolveRef) {
      resolveRef.resolve(true);
    }
  };

  const isDelete = options?.title.toLowerCase().includes('delete');

  return (
    <ConfirmationContext.Provider value={{ confirm }}>
      {children}
      <Dialog open={isOpen} onClose={handleCancel} size="s">
        {options && (
          <>
            <Dialog.Header caption={options.title} />
            <Dialog.Body>
              {options.content && (
                <div className="pt-2 pb-4 text-base text-gray-700 dark:text-gray-300">
                  {options.content}
                </div>
              )}
            </Dialog.Body>
            <Dialog.Footer
              preset="default"
              onClickButtonCancel={handleCancel}
              onClickButtonApply={handleConfirm}
              textButtonCancel={options.cancelText || 'Cancel'}
              textButtonApply={options.okText || 'Confirm'}
              propsButtonApply={{ view: isDelete ? 'flat-danger' : 'normal' }}
            />
          </>
        )}
      </Dialog>
    </ConfirmationContext.Provider>
  );
};
