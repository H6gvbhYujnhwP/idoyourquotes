import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { 
  FolderOpen, 
  Loader2, 
  Sparkles, 
  FileText,
  Image,
  File,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface DocumentsTabProps {
  quoteId: number;
  config: any;
  inputs: any[];
  refetch: () => void;
}

export default function DocumentsTab({ quoteId, config, inputs, refetch }: DocumentsTabProps) {
  const [categorizingId, setCategorizingId] = useState<number | null>(null);

  const categorizeDocument = trpc.quotes.categorizeDocument.useMutation({
    onSuccess: (data) => {
      toast.success(`Document categorised as: ${data.category}`);
      setCategorizingId(null);
      refetch();
    },
    onError: (error) => {
      toast.error("Failed to categorise: " + error.message);
      setCategorizingId(null);
    },
  });

  const drawingsConfig = config?.sections?.drawings;
  const supportingDocsConfig = config?.sections?.supportingDocs;

  const drawingCategories = drawingsConfig?.categories || [];
  const supportingCategories = supportingDocsConfig?.categories || [];
  const drawingFiles = drawingsConfig?.filesByCategory || {};
  const supportingFiles = supportingDocsConfig?.filesByCategory || {};

  // Get uncategorised inputs (those not assigned to any category)
  const categorisedInputIds = new Set<number>();
  Object.values(drawingFiles).forEach((ids: any) => {
    if (Array.isArray(ids)) ids.forEach((id: number) => categorisedInputIds.add(id));
  });
  Object.values(supportingFiles).forEach((ids: any) => {
    if (Array.isArray(ids)) ids.forEach((id: number) => categorisedInputIds.add(id));
  });

  const uncategorisedInputs = inputs.filter(
    (inp) => !categorisedInputIds.has(inp.id) && inp.inputType !== "text"
  );

  const getInputById = (id: number) => inputs.find((inp) => inp.id === id);

  const getFileIcon = (inputType: string) => {
    switch (inputType) {
      case "image": return <Image className="h-4 w-4" />;
      case "pdf":
      case "document": return <FileText className="h-4 w-4" />;
      default: return <File className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Uncategorised Documents */}
      {uncategorisedInputs.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700">
              <FolderOpen className="h-5 w-5" />
              Uncategorised Documents ({uncategorisedInputs.length})
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              These uploaded files have not been assigned to a category. Use AI to auto-categorise them.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {uncategorisedInputs.map((inp) => (
                <div key={inp.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    {getFileIcon(inp.inputType)}
                    <div>
                      <p className="text-sm font-medium">{inp.filename || `${inp.inputType} input`}</p>
                      <p className="text-xs text-muted-foreground">{inp.inputType}</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setCategorizingId(inp.id);
                      categorizeDocument.mutate({ quoteId, inputId: inp.id });
                    }}
                    disabled={categorizingId === inp.id}
                  >
                    {categorizingId === inp.id ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="mr-1 h-3 w-3" />
                    )}
                    Categorise
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Drawings */}
      {drawingsConfig?.enabled && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Image className="h-5 w-5" />
              Drawings & Plans
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Technical drawings, plans, and visual documentation organised by category.
            </p>
          </CardHeader>
          <CardContent>
            {drawingCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No drawing categories configured.</p>
            ) : (
              <div className="space-y-4">
                {drawingCategories.map((category: string) => {
                  const fileIds = drawingFiles[category] || [];
                  return (
                    <div key={category} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium capitalize">{category.replace(/_/g, " ")}</h4>
                        <Badge variant="outline">{fileIds.length} files</Badge>
                      </div>
                      {fileIds.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No files in this category yet.</p>
                      ) : (
                        <div className="space-y-1">
                          {fileIds.map((id: number) => {
                            const inp = getInputById(id);
                            return inp ? (
                              <div key={id} className="flex items-center gap-2 text-sm p-1">
                                {getFileIcon(inp.inputType)}
                                <span>{inp.filename || `File #${id}`}</span>
                              </div>
                            ) : null;
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Supporting Documents */}
      {supportingDocsConfig?.enabled && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Supporting Documents
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Specifications, method statements, certificates, and other supporting documentation.
            </p>
          </CardHeader>
          <CardContent>
            {supportingCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No supporting document categories configured.</p>
            ) : (
              <div className="space-y-4">
                {supportingCategories.map((category: string) => {
                  const fileIds = supportingFiles[category] || [];
                  return (
                    <div key={category} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium capitalize">{category.replace(/_/g, " ")}</h4>
                        <Badge variant="outline">{fileIds.length} files</Badge>
                      </div>
                      {fileIds.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No files in this category yet.</p>
                      ) : (
                        <div className="space-y-1">
                          {fileIds.map((id: number) => {
                            const inp = getInputById(id);
                            return inp ? (
                              <div key={id} className="flex items-center gap-2 text-sm p-1">
                                {getFileIcon(inp.inputType)}
                                <span>{inp.filename || `File #${id}`}</span>
                              </div>
                            ) : null;
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* No document sections enabled */}
      {!drawingsConfig?.enabled && !supportingDocsConfig?.enabled && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>No document sections are enabled for this trade preset.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
