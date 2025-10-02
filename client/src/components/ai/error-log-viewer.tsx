import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertCircle, Bug, CheckCircle, XCircle, Sparkles } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import type { ErrorLog } from '@shared/schema';

export function ErrorLogViewer() {
  const [activeTab, setActiveTab] = useState<'unresolved' | 'all'>('unresolved');
  const [selectedError, setSelectedError] = useState<ErrorLog | null>(null);
  const [diagnosis, setDiagnosis] = useState<any>(null);
  const queryClient = useQueryClient();

  const { data: unresolvedErrors } = useQuery<ErrorLog[]>({
    queryKey: ['/api/ai/error-logs', 'unresolved'],
    queryFn: () => fetch('/api/ai/error-logs?resolved=false').then(r => r.json()),
    refetchInterval: 30000,
  });

  const { data: allErrors } = useQuery<ErrorLog[]>({
    queryKey: ['/api/ai/error-logs', 'all'],
    queryFn: () => fetch('/api/ai/error-logs').then(r => r.json()),
    refetchInterval: 60000,
  });

  const diagnoseMutation = useMutation({
    mutationFn: async (errorId: string) => {
      const res = await apiRequest('POST', '/api/ai/diagnose-error', { errorId });
      return await res.json();
    },
    onSuccess: (data) => {
      setDiagnosis(data);
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      const res = await apiRequest('POST', `/api/ai/error-logs/${id}/resolve`, { notes });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ai/error-logs'] });
      setSelectedError(null);
      setDiagnosis(null);
    },
  });

  const handleDiagnose = (error: ErrorLog) => {
    setSelectedError(error);
    setDiagnosis(null);
    diagnoseMutation.mutate(error.id);
  };

  const getErrorIcon = (errorType: string) => {
    if (errorType.includes('trade')) return <XCircle className="w-4 h-4 text-red-500" />;
    if (errorType.includes('api')) return <AlertCircle className="w-4 h-4 text-orange-500" />;
    return <Bug className="w-4 h-4 text-yellow-500" />;
  };

  const errors = activeTab === 'unresolved' ? unresolvedErrors : allErrors;

  return (
    <>
      <Card className="p-4" data-testid="card-error-log">
        <div className="mb-4">
          <h3 className="font-semibold mb-1">Error Logs</h3>
          <p className="text-sm text-muted-foreground">
            Track and diagnose system errors
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="mb-4">
            <TabsTrigger value="unresolved" data-testid="tab-unresolved">
              Unresolved
              {unresolvedErrors && unresolvedErrors.length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {unresolvedErrors.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab}>
            <ScrollArea className="h-[400px]">
              {!errors || errors.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50 text-green-500" />
                  <p className="text-sm text-muted-foreground">
                    {activeTab === 'unresolved' ? 'No unresolved errors' : 'No errors logged'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {errors.map((error) => (
                    <div
                      key={error.id}
                      className="border rounded-lg p-3"
                      data-testid={`error-log-${error.id}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-1">
                          {getErrorIcon(error.errorType)}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">{error.errorType}</span>
                            {error.resolved ? (
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                Resolved
                              </Badge>
                            ) : (
                              <Badge variant="destructive">Unresolved</Badge>
                            )}
                          </div>
                          
                          <p className="text-sm mb-2">{error.errorMessage}</p>
                          
                          {error.context && (
                            <p className="text-xs text-muted-foreground mb-2">
                              Context: {JSON.stringify(error.context)}
                            </p>
                          )}
                          
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{error.timestamp ? new Date(error.timestamp).toLocaleString() : 'N/A'}</span>
                            {error.resolvedAt && (
                              <span>• Resolved: {new Date(error.resolvedAt).toLocaleString()}</span>
                            )}
                          </div>
                          
                          {!error.resolved && (
                            <div className="mt-2 flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDiagnose(error)}
                                data-testid={`button-diagnose-${error.id}`}
                              >
                                <Sparkles className="w-3 h-3 mr-1" />
                                AI Diagnose
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => resolveMutation.mutate({ id: error.id })}
                                data-testid={`button-resolve-${error.id}`}
                              >
                                Mark Resolved
                              </Button>
                            </div>
                          )}
                          
                          {error.notes && (
                            <p className="text-xs text-muted-foreground mt-2">
                              Notes: {error.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </Card>

      {/* Diagnosis Dialog */}
      <Dialog open={!!selectedError} onOpenChange={() => {
        setSelectedError(null);
        setDiagnosis(null);
      }}>
        <DialogContent className="max-w-2xl" data-testid="dialog-error-diagnosis">
          <DialogHeader>
            <DialogTitle>AI Error Diagnosis</DialogTitle>
            <DialogDescription>
              {selectedError && `Analyzing ${selectedError.errorType}`}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {diagnoseMutation.isPending && (
              <div className="text-center py-8">
                <Sparkles className="w-8 h-8 mx-auto mb-3 animate-pulse" />
                <p className="text-sm text-muted-foreground">Analyzing error with AI...</p>
              </div>
            )}
            
            {diagnosis && (
              <>
                <div>
                  <h4 className="font-semibold mb-2">Diagnosis</h4>
                  <p className="text-sm bg-muted p-3 rounded">{diagnosis.diagnosis}</p>
                </div>
                
                {diagnosis.suggestedFixes && diagnosis.suggestedFixes.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2">Suggested Fixes</h4>
                    <ul className="space-y-2">
                      {diagnosis.suggestedFixes.map((fix: string, index: number) => (
                        <li key={index} className="text-sm flex gap-2">
                          <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                          <span>{fix}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {diagnosis.relatedIssues && diagnosis.relatedIssues.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2">Related Issues to Watch</h4>
                    <ul className="space-y-1">
                      {diagnosis.relatedIssues.map((issue: string, index: number) => (
                        <li key={index} className="text-sm text-muted-foreground">
                          • {issue}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                <div className="flex gap-2">
                  <Button
                    onClick={() => selectedError && resolveMutation.mutate({
                      id: selectedError.id,
                      notes: `Diagnosed: ${diagnosis.diagnosis}`
                    })}
                    disabled={resolveMutation.isPending}
                    data-testid="button-resolve-with-diagnosis"
                  >
                    Mark as Resolved
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedError(null);
                      setDiagnosis(null);
                    }}
                    data-testid="button-close-diagnosis"
                  >
                    Close
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
