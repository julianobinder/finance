import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Download, Database, AlertCircle, Upload, RotateCcw, Loader2, CheckCircle2, X } from 'lucide-react';
import api from '@/services/api';

export function Settings() {
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isEmptyDbLoading, setIsEmptyDbLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showRestoreCompleteDialog, setShowRestoreCompleteDialog] = useState(false);
  const [restoreCompleteMessage, setRestoreCompleteMessage] = useState<string>('');

  // Exchange Rate API Configuration states
  const [currencyUrl, setCurrencyUrl] = useState('');
  const [currencyApi, setCurrencyApi] = useState('');
  const [isConfigLoading, setIsConfigLoading] = useState(true);
  const [isConfigSaving, setIsConfigSaving] = useState(false);
  const [configSuccess, setConfigSuccess] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [showEmptyDbConfirmDialog, setShowEmptyDbConfirmDialog] = useState(false);
  const [showEmptyDbCompleteDialog, setShowEmptyDbCompleteDialog] = useState(false);
  const [emptyDbCompleteMessage, setEmptyDbCompleteMessage] = useState<string>('');
  const [isSampleDbLoading, setIsSampleDbLoading] = useState(false);
  const [showSampleDbConfirmDialog, setShowSampleDbConfirmDialog] = useState(false);
  const [showSampleDbCompleteDialog, setShowSampleDbCompleteDialog] = useState(false);
  const [sampleDbCompleteMessage, setSampleDbCompleteMessage] = useState<string>('');
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleBackup = async () => {
    try {
      setIsBackingUp(true);
      setError(null);
      setSuccess(null);

      const response = await api.get('/settings/backup/', {
        responseType: 'blob',
      });

      // Create a blob URL and trigger download
      const blob = new Blob([response.data], { type: 'application/zip' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers['content-disposition'];
      let filename = 'finance_backup.zip';
      if (contentDisposition) {
        // Extract filename from Content-Disposition header
        // Handles both formats: filename="name.zip" and filename=name.zip
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch) {
          filename = filenameMatch[1].replace(/['"]/g, '').trim();
        }
      }
      
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setSuccess('Database backup created and downloaded successfully.');
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      let errorMessage = 'Failed to create database backup';
      
      if (err.response?.data) {
        // Try to parse error from blob response
        if (err.response.data instanceof Blob) {
          try {
            const text = await err.response.data.text();
            const errorData = JSON.parse(text);
            errorMessage = errorData.error || errorMessage;
          } catch {
            errorMessage = 'Failed to create database backup';
          }
        } else if (typeof err.response.data === 'object') {
          errorMessage = err.response.data.error || errorMessage;
        }
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.zip')) {
        setError('Please select a .zip file');
        setRestoreFile(null);
        return;
      }
      setRestoreFile(file);
      setError(null);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isRestoring) return;
    
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (isRestoring) return;

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (!file.name.endsWith('.zip')) {
        setError('Please select a .zip file');
        setRestoreFile(null);
        return;
      }
      setRestoreFile(file);
      setError(null);
    }
  };

  const handleRestoreClick = () => {
    if (!restoreFile) {
      setError('Please select a backup file first');
      return;
    }
    setShowConfirmDialog(true);
  };

  const handleRestoreConfirm = async () => {
    if (!restoreFile) {
      return;
    }

    try {
      setIsRestoring(true);
      setError(null);
      setSuccess(null);
      setShowConfirmDialog(false);

      const formData = new FormData();
      formData.append('file', restoreFile);

      const response = await api.post('/settings/restore/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const message = response.data.message || 'Database restored successfully.';
      setRestoreCompleteMessage(message);
      setRestoreFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setShowRestoreCompleteDialog(true);
    } catch (err: any) {
      let errorMessage = 'Failed to restore database';
      
      if (err.response?.data) {
        if (typeof err.response.data === 'object') {
          errorMessage = err.response.data.error || errorMessage;
        } else if (typeof err.response.data === 'string') {
          errorMessage = err.response.data;
        }
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      setShowRestoreCompleteDialog(true);
      setRestoreCompleteMessage(errorMessage);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleRestoreCompleteClose = () => {
    setShowRestoreCompleteDialog(false);
    setRestoreCompleteMessage('');
    setError(null);
  };

  const handleEmptyDbClick = () => {
    setShowEmptyDbConfirmDialog(true);
  };

  const handleEmptyDbConfirm = async () => {
    try {
      setIsEmptyDbLoading(true);
      setError(null);
      setSuccess(null);
      setShowEmptyDbConfirmDialog(false);

      const response = await api.post('/settings/empty-db/');

      const message = response.data.message || 'Empty database loaded successfully.';
      setEmptyDbCompleteMessage(message);
      setShowEmptyDbCompleteDialog(true);
    } catch (err: any) {
      let errorMessage = 'Failed to load empty database';
      
      if (err.response?.data) {
        if (typeof err.response.data === 'object') {
          errorMessage = err.response.data.detail || err.response.data.error || errorMessage;
        } else if (typeof err.response.data === 'string') {
          errorMessage = err.response.data;
        }
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      setEmptyDbCompleteMessage(errorMessage);
      setShowEmptyDbCompleteDialog(true);
    } finally {
      setIsEmptyDbLoading(false);
    }
  };

  const handleEmptyDbCompleteClose = () => {
    setShowEmptyDbCompleteDialog(false);
    setEmptyDbCompleteMessage('');
    setError(null);
  };

  const handleSampleDbClick = () => {
    setShowSampleDbConfirmDialog(true);
  };

  const handleSampleDbConfirm = async () => {
    try {
      setIsSampleDbLoading(true);
      setError(null);
      setSuccess(null);
      setShowSampleDbConfirmDialog(false);

      const response = await api.post('/settings/sample-db/');

      const message = response.data.message || 'Sample database loaded successfully.';
      setSampleDbCompleteMessage(message);
      setShowSampleDbCompleteDialog(true);
    } catch (err: any) {
      let errorMessage = 'Failed to load sample database';
      
      if (err.response?.data) {
        if (typeof err.response.data === 'object') {
          errorMessage = err.response.data.detail || err.response.data.error || errorMessage;
        } else if (typeof err.response.data === 'string') {
          errorMessage = err.response.data;
        }
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      setSampleDbCompleteMessage(errorMessage);
      setShowSampleDbCompleteDialog(true);
    } finally {
      setIsSampleDbLoading(false);
    }
  };

  const handleSampleDbCompleteClose = () => {
    setShowSampleDbCompleteDialog(false);
    setSampleDbCompleteMessage('');
    setError(null);
  };

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setIsConfigLoading(true);
        const response = await api.get('/settings/config/');
        setCurrencyUrl(response.data.currency_url || '');
        setCurrencyApi(response.data.currrency_api || '');
      } catch (err: any) {
        console.error('Failed to fetch configuration settings', err);
        setConfigError('Failed to load API configuration settings.');
      } finally {
        setIsConfigLoading(false);
      }
    };

    fetchConfig();
  }, []);

  const handleConfigSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsConfigSaving(true);
      setConfigError(null);
      setConfigSuccess(null);

      await api.post('/settings/config/', {
        currency_url: currencyUrl,
        currrency_api: currencyApi,
      });

      setConfigSuccess('API configuration updated successfully.');
      setTimeout(() => setConfigSuccess(null), 5000);
    } catch (err: any) {
      let errorMessage = 'Failed to update API configuration';
      if (err.response?.data?.detail) {
        errorMessage = err.response.data.detail;
      } else if (err.message) {
        errorMessage = err.message;
      }
      setConfigError(errorMessage);
    } finally {
      setIsConfigSaving(false);
    }
  };

  return (
    <div className="p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground mt-2">Manage your application settings and database backups.</p>
        </div>

      <div className="border rounded-lg p-6 space-y-4">
        <div className="flex items-center space-x-3">
          <Database className="h-5 w-5 text-muted-foreground" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold">Database Backup</h2>
            <p className="text-sm text-muted-foreground">
              Create a backup of your database. The backup will be downloaded as a compressed ZIP file.
            </p>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert>
            <AlertTitle>Success</AlertTitle>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        <Button
          onClick={handleBackup}
          disabled={isBackingUp}
          className="w-full sm:w-auto"
        >
          {isBackingUp ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          {isBackingUp ? 'Creating Backup...' : 'Backup Database'}
        </Button>
      </div>

      <div className="border rounded-lg p-6 space-y-4">
        <div className="flex items-center space-x-3">
          <RotateCcw className="h-5 w-5 text-muted-foreground" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold">Database Restore</h2>
            <p className="text-sm text-muted-foreground">
              Restore your database from a backup file. This will replace all current data.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="restore-file">Select Backup File</Label>
            
            <div
              className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 cursor-pointer transition-all duration-200 ease-in-out ${
                isRestoring 
                  ? 'opacity-50 cursor-not-allowed border-muted-foreground/10 bg-muted/5'
                  : isDragActive
                  ? 'border-primary bg-primary/5 scale-[1.01] shadow-sm'
                  : restoreFile
                  ? 'border-green-500/40 bg-green-500/5 dark:bg-green-500/10 hover:border-green-500/60'
                  : 'border-muted-foreground/20 hover:border-primary/50 hover:bg-muted/20'
              }`}
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => {
                if (!isRestoring) {
                  fileInputRef.current?.click();
                }
              }}
            >
              <input
                id="restore-file"
                ref={fileInputRef}
                type="file"
                accept=".zip"
                onChange={handleFileSelect}
                className="hidden"
                disabled={isRestoring}
              />
              
              <div className="flex flex-col items-center justify-center text-center space-y-3">
                <div className={`p-3 rounded-full transition-colors duration-200 ${
                  restoreFile 
                    ? 'bg-green-100 text-green-600 dark:bg-green-900/30' 
                    : isDragActive
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {restoreFile ? (
                    <CheckCircle2 className="h-6 w-6" />
                  ) : (
                    <Upload className="h-6 w-6" />
                  )}
                </div>
                
                <div className="space-y-1">
                  {restoreFile ? (
                    <>
                      <p className="font-semibold text-sm text-foreground">
                        {restoreFile.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(restoreFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold text-sm text-foreground">
                        {isDragActive ? 'Drop file to upload' : 'Drag & drop backup zip, or click to browse'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Supports compressed ZIP backup files
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>

            {restoreFile && !isRestoring && (
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRestoreFile(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                    }
                  }}
                  className="text-muted-foreground hover:text-destructive h-8 px-2 hover:bg-destructive/10"
                >
                  <X className="h-4 w-4 mr-1.5" />
                  Clear Selection
                </Button>
              </div>
            )}
          </div>

          <Button
            onClick={handleRestoreClick}
            disabled={isRestoring || !restoreFile}
            variant="destructive"
            className="w-full sm:w-auto"
          >
            {isRestoring ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            {isRestoring ? 'Restoring...' : 'Restore Database'}
          </Button>
        </div>
      </div>

      <div className="border rounded-lg p-6 space-y-4">
        <div className="flex items-center space-x-3">
          <Database className="h-5 w-5 text-muted-foreground" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold">Exchange Rate API Configuration</h2>
            <p className="text-sm text-muted-foreground">
              Configure your API key to fetch live exchange rates for cross-currency transfers and consolidated balances.
            </p>
          </div>
        </div>

        {configError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Configuration Error</AlertTitle>
            <AlertDescription>{configError}</AlertDescription>
          </Alert>
        )}

        {configSuccess && (
          <Alert>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertTitle>Success</AlertTitle>
            <AlertDescription>{configSuccess}</AlertDescription>
          </Alert>
        )}

        {isConfigLoading ? (
          <div className="flex items-center space-x-2 py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Loading configuration...</span>
          </div>
        ) : (
          <form onSubmit={handleConfigSave} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="currency-api">API Key</Label>
              <Input
                id="currency-api"
                type="text"
                placeholder="Enter your CurrencyFreaks API Key"
                value={currencyApi}
                onChange={(e) => setCurrencyApi(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                To get a free API key, sign up at{' '}
                <a
                  href="https://currencyfreaks.com/signup"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline hover:text-primary/80 font-medium"
                >
                  currencyfreaks.com/signup
                </a>.
              </p>
            </div>

            <Button
              type="submit"
              disabled={isConfigSaving}
              className="w-full sm:w-auto"
            >
              {isConfigSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              {isConfigSaving ? 'Saving...' : 'Save Configuration'}
            </Button>
          </form>
        )}
      </div>

      <div className="border border-destructive/20 rounded-lg p-6 space-y-4">
        <div className="flex items-center space-x-3">
          <Database className="h-5 w-5 text-destructive" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-destructive">Database Reset</h2>
            <p className="text-sm text-muted-foreground">
              Delete the current database completely and load either a fresh, brand-new empty database or a pre-populated database with sample financial data.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={handleEmptyDbClick}
            disabled={isRestoring || isBackingUp || isEmptyDbLoading || isSampleDbLoading}
            variant="destructive"
            className="w-full sm:w-auto"
          >
            {isEmptyDbLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <AlertCircle className="h-4 w-4 mr-2" />
            )}
            {isEmptyDbLoading ? 'Loading Empty Database...' : 'Load Empty Database'}
          </Button>

          <Button
            onClick={handleSampleDbClick}
            disabled={isRestoring || isBackingUp || isEmptyDbLoading || isSampleDbLoading}
            variant="outline"
            className="w-full sm:w-auto border-destructive/30 hover:bg-destructive/10 text-destructive hover:text-destructive"
          >
            {isSampleDbLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Database className="h-4 w-4 mr-2" />
            )}
            {isSampleDbLoading ? 'Loading Sample Database...' : 'Load Sample Database'}
          </Button>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Database Restore</DialogTitle>
            <DialogDescription>
              This action will replace all current database data with the backup file. This cannot be undone.
              Are you sure you want to proceed?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(false)}
              disabled={isRestoring}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRestoreConfirm}
              disabled={isRestoring}
            >
              {isRestoring ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Restoring...
                </>
              ) : (
                'Yes, Restore Database'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Blocking Overlay During Restore */}
      <Dialog open={isRestoring}>
        <DialogContent 
          className="sm:max-w-md [&>button]:hidden" 
          onPointerDownOutside={(e) => e.preventDefault()} 
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Restoring Database
            </DialogTitle>
            <DialogDescription>
              Please wait while the database is being restored. This may take a few moments.
              Do not close this window or refresh the page.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      {/* Restore Complete Dialog */}
      <Dialog open={showRestoreCompleteDialog} onOpenChange={handleRestoreCompleteClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {error ? (
                <>
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  Restore Failed
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  Restore Complete
                </>
              )}
            </DialogTitle>
            <DialogDescription className="pt-2">
              {restoreCompleteMessage || (error ? 'An error occurred during restore.' : 'Database restored successfully.')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={handleRestoreCompleteClose}>
              {error ? 'Close' : 'OK'}
            </Button>
          </DialogFooter>
          </DialogContent>
        </Dialog>

      {/* Load Empty Database Confirmation Dialog */}
      <Dialog open={showEmptyDbConfirmDialog} onOpenChange={setShowEmptyDbConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Database Reset</DialogTitle>
            <DialogDescription className="space-y-3 pt-2">
              <div className="bg-destructive/10 text-destructive p-3 rounded-md border border-destructive/20 flex gap-2 items-start text-xs font-semibold">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>WARNING: This operation is destructive and permanently deletes all accounts, groups, transaction records, payees, custom categories, and CSV templates. This cannot be undone!</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Are you sure you want to delete the current database and initialize a fresh, empty database?
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowEmptyDbConfirmDialog(false)}
              disabled={isEmptyDbLoading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleEmptyDbConfirm}
              disabled={isEmptyDbLoading}
            >
              {isEmptyDbLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Loading Empty Database...
                </>
              ) : (
                'Yes, Load Empty Database'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Load Sample Database Confirmation Dialog */}
      <Dialog open={showSampleDbConfirmDialog} onOpenChange={setShowSampleDbConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Sample Database Load</DialogTitle>
            <DialogDescription className="space-y-3 pt-2">
              <div className="bg-destructive/10 text-destructive p-3 rounded-md border border-destructive/20 flex gap-2 items-start text-xs font-semibold">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>WARNING: This operation is destructive and permanently deletes all accounts, groups, transaction records, payees, custom categories, and CSV templates. This cannot be undone!</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Are you sure you want to delete the current database and populate it with sample categories, payees, titulars, groups (Kids, Business), and transactional data?
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSampleDbConfirmDialog(false)}
              disabled={isSampleDbLoading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleSampleDbConfirm}
              disabled={isSampleDbLoading}
            >
              {isSampleDbLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Loading Sample Database...
                </>
              ) : (
                'Yes, Load Sample Database'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Blocking Overlay During Empty DB Load */}
      <Dialog open={isEmptyDbLoading}>
        <DialogContent 
          className="sm:max-w-md [&>button]:hidden" 
          onPointerDownOutside={(e) => e.preventDefault()} 
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Initializing Empty Database
            </DialogTitle>
            <DialogDescription>
              Please wait while the database schema is being recreated and default system configurations are seeded.
              Do not close this window or refresh the page.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      {/* Blocking Overlay During Sample DB Load */}
      <Dialog open={isSampleDbLoading}>
        <DialogContent 
          className="sm:max-w-md [&>button]:hidden" 
          onPointerDownOutside={(e) => e.preventDefault()} 
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Initializing Sample Database
            </DialogTitle>
            <DialogDescription>
              Please wait while the database schema is being recreated and sample financial entries are seeded.
              Do not close this window or refresh the page.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      {/* Empty DB Load Complete Dialog */}
      <Dialog open={showEmptyDbCompleteDialog} onOpenChange={handleEmptyDbCompleteClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {error ? (
                <>
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  Reset Failed
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  Database Reinitialized
                </>
              )}
            </DialogTitle>
            <DialogDescription className="pt-2">
              {emptyDbCompleteMessage || (error ? 'An error occurred during database reset.' : 'Empty database loaded successfully.')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={handleEmptyDbCompleteClose}>
              {error ? 'Close' : 'OK'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sample DB Load Complete Dialog */}
      <Dialog open={showSampleDbCompleteDialog} onOpenChange={handleSampleDbCompleteClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {error ? (
                <>
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  Load Failed
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  Database Reinitialized
                </>
              )}
            </DialogTitle>
            <DialogDescription className="pt-2">
              {sampleDbCompleteMessage || (error ? 'An error occurred during database reset.' : 'Sample database loaded successfully.')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={handleSampleDbCompleteClose}>
              {error ? 'Close' : 'OK'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      </div>
    </div>
  );
}

