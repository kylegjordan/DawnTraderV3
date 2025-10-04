import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardCopy, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ValidationReport {
  runId: string;
  timestamp: string;
  model: string;
  inputTokensEst: number;
  outputTokensEst: number;
  costEstimate: string;
  pairsConsidered: number;
  pairsSentToAi: number;
  opportunitiesCreated: number;
  sampleOpportunities: any[];
  guardrailSummary: {
    total: number;
    wouldPass: number;
    wouldFail: number;
    details: Array<{
      opportunityId: string;
      symbol: string;
      wouldPass: boolean;
      reasons: string[];
    }>;
  };
}

export function ValidationReportsTab() {
  const { toast } = useToast();
  const [expandedJson, setExpandedJson] = useState<string | null>(null);

  const { data: report, isLoading } = useQuery<ValidationReport>({
    queryKey: ["/api/ai/opportunities/validation-report"],
    queryFn: async () => {
      return await apiRequest<ValidationReport>("GET", "/api/ai/opportunities/validation-report");
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "JSON copied to clipboard",
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="bg-white border-gray-200">
            <CardContent className="p-6">
              <Skeleton className="h-32 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!report) {
    return (
      <Card className="bg-white border-gray-200">
        <CardContent className="p-8 text-center">
          <p className="text-gray-600">No validation reports available</p>
          <p className="text-sm text-gray-500 mt-2">
            Generate AI opportunities to see validation data
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Run Metadata */}
      <Card className="bg-white border-gray-200">
        <CardHeader>
          <CardTitle className="text-gray-800">Run Metadata</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-600 uppercase tracking-wide">Run ID</p>
              <p className="text-sm font-mono text-gray-800 truncate">{report.runId}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600 uppercase tracking-wide">Date/Time</p>
              <p className="text-sm text-gray-800">{new Date(report.timestamp).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600 uppercase tracking-wide">Model</p>
              <p className="text-sm font-mono text-gray-800">{report.model}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600 uppercase tracking-wide">Pairs Analyzed</p>
              <p className="text-sm font-semibold text-gray-800">{report.pairsConsidered}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600 uppercase tracking-wide">Sent to AI</p>
              <p className="text-sm font-semibold text-gray-800">{report.pairsSentToAi}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600 uppercase tracking-wide">Valid Opportunities</p>
              <p className="text-sm font-semibold text-green-600">{report.opportunitiesCreated}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Token & Cost Summary */}
      <Card className="bg-white border-gray-200">
        <CardHeader>
          <CardTitle className="text-gray-800">Token & Cost Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-xs text-blue-600 uppercase tracking-wide">Input Tokens</p>
              <p className="text-2xl font-bold text-blue-700">{report.inputTokensEst.toLocaleString()}</p>
            </div>
            <div className="p-4 bg-purple-50 rounded-lg">
              <p className="text-xs text-purple-600 uppercase tracking-wide">Output Tokens</p>
              <p className="text-2xl font-bold text-purple-700">{report.outputTokensEst.toLocaleString()}</p>
            </div>
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="text-xs text-green-600 uppercase tracking-wide">Total Cost</p>
              <p className="text-2xl font-bold text-green-700">
                ${parseFloat(report.costEstimate).toFixed(4)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Guardrail Summary */}
      <Card className="bg-white border-gray-200">
        <CardHeader>
          <CardTitle className="text-gray-800">Guardrail Validation Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="text-sm text-gray-600">Would Pass:</span>
                <span className="text-lg font-bold text-green-600">{report.guardrailSummary.wouldPass}</span>
              </div>
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-600" />
                <span className="text-sm text-gray-600">Would Fail:</span>
                <span className="text-lg font-bold text-red-600">{report.guardrailSummary.wouldFail}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Total:</span>
                <span className="text-lg font-bold text-gray-800">{report.guardrailSummary.total}</span>
              </div>
            </div>

            {/* Guardrail Details Table */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Symbol
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Reasons
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {report.guardrailSummary.details.map((detail, idx) => (
                    <tr key={detail.opportunityId} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-800">{detail.symbol}</td>
                      <td className="px-4 py-3">
                        {detail.wouldPass ? (
                          <Badge className="bg-green-600 text-white">Pass</Badge>
                        ) : (
                          <Badge className="bg-red-600 text-white">Fail</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {detail.reasons.length > 0 ? detail.reasons.join(", ") : "None"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sample Opportunities */}
      <Card className="bg-white border-gray-200">
        <CardHeader>
          <CardTitle className="text-gray-800">Top 5 Sample Opportunities</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {report.sampleOpportunities.map((opp, idx) => (
            <div key={opp.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h4 className="font-semibold text-gray-800">{opp.symbol}</h4>
                  <p className="text-sm text-gray-600">{opp.type.replace(/_/g, " ")}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(JSON.stringify(opp, null, 2))}
                  data-testid={`button-copy-json-${idx}`}
                >
                  <ClipboardCopy className="w-4 h-4 mr-1" />
                  Copy JSON
                </Button>
              </div>
              
              {expandedJson === opp.id ? (
                <div className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-auto max-h-64">
                  <pre className="text-xs font-mono">{JSON.stringify(opp, null, 2)}</pre>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpandedJson(opp.id)}
                  className="text-blue-600 hover:text-blue-700"
                >
                  Show JSON
                </Button>
              )}
              
              {expandedJson === opp.id && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpandedJson(null)}
                  className="text-gray-600 mt-2"
                >
                  Hide JSON
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
