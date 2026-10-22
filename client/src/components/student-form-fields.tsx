import type { Dispatch, SetStateAction } from "react";
import { characteristicValueToArray, isCharacteristicApplicableToGrade, normalizeResponses } from "@shared/characteristics";
import type { Characteristic, InsertStudent } from "@shared/schema";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface StudentFormFieldsProps {
  formData: Partial<InsertStudent>;
  setFormData: Dispatch<SetStateAction<Partial<InsertStudent>>>;
  characteristics: Characteristic[];
}

export function StudentFormFields({ formData, setFormData, characteristics }: StudentFormFieldsProps) {
  const responseLookup = new Map(
    characteristics
      .filter((characteristic) => characteristic.type === "category")
      .map((characteristic) => [
        characteristic.name,
        new Map(normalizeResponses(characteristic).map((response) => [response.name, response])),
      ]),
  );

  return (
    <div className="grid gap-4 py-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName">First Name *</Label>
          <Input
            id="firstName"
            value={formData.firstName ?? ""}
            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
            placeholder="Enter first name"
            data-testid="input-first-name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Last Name *</Label>
          <Input
            id="lastName"
            value={formData.lastName ?? ""}
            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
            placeholder="Enter last name"
            data-testid="input-last-name"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="grade">Grade *</Label>
          <Select value={formData.grade ?? ""} onValueChange={(value) => setFormData({ ...formData, grade: value })}>
            <SelectTrigger data-testid="select-grade"><SelectValue placeholder="Select grade" /></SelectTrigger>
            <SelectContent>
              {["K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"].map((grade) => (
                <SelectItem key={grade} value={grade}>Grade {grade}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="currentClass">Current Class</Label>
          <Input
            id="currentClass"
            value={formData.currentClass ?? ""}
            onChange={(e) => setFormData({ ...formData, currentClass: e.target.value })}
            placeholder="e.g., 3A"
            data-testid="input-current-class"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="gender">Gender</Label>
        <Select value={formData.gender ?? ""} onValueChange={(value) => setFormData({ ...formData, gender: value })}>
          <SelectTrigger data-testid="select-gender"><SelectValue placeholder="Select gender" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="male">Male</SelectItem>
            <SelectItem value="female">Female</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {characteristics.length > 0 && (
        <div className="space-y-4">
          <Label>Characteristics</Label>
          <div className="grid grid-cols-2 gap-4">
            {characteristics
              .filter((characteristic) => isCharacteristicApplicableToGrade(characteristic, formData.grade))
              .map((characteristic) => {
                const responses = responseLookup.get(characteristic.name);
                const options = responses ? Array.from(responses.keys()) : characteristic.options || [];
                const isNumeric = characteristic.type === "scale" || characteristic.type === "percentage";
                const rawValue = ((formData.characteristics || {}) as Record<string, string | string[]>)[characteristic.name];
                const selectedValues = characteristicValueToArray(rawValue);
                const selectedValue = selectedValues[0] || "";
                const selectedResponse = responses?.get(selectedValue);
                return (
                  <div key={characteristic.id} className="space-y-2">
                    <Label htmlFor={characteristic.id} className="text-sm text-muted-foreground">{characteristic.name}</Label>
                    {characteristic.type === "category" && options.length > 0 && characteristic.multiSelect ? (
                      <div className="space-y-2 rounded-md border p-2">
                        {options.map((option) => {
                          const response = responses?.get(option);
                          return (
                            <label key={option} className="flex cursor-pointer items-center gap-2 text-sm">
                              <Checkbox
                                checked={selectedValues.includes(option)}
                                onCheckedChange={(checked) => {
                                  const next = checked === true
                                    ? Array.from(new Set([...selectedValues, option]))
                                    : selectedValues.filter((value) => value !== option);
                                  setFormData({
                                    ...formData,
                                    characteristics: { ...formData.characteristics, [characteristic.name]: next },
                                  });
                                }}
                              />
                              {response && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: response.color }} />}
                              <span>{option}</span>
                            </label>
                          );
                        })}
                      </div>
                    ) : characteristic.type === "category" && options.length > 0 ? (
                      <Select
                        value={selectedValue || "__empty__"}
                        onValueChange={(value) => setFormData({
                          ...formData,
                          characteristics: { ...formData.characteristics, [characteristic.name]: value === "__empty__" ? "" : value },
                        })}
                      >
                        <SelectTrigger data-testid={`select-char-${characteristic.id}`}>
                          {selectedValue ? (
                            <span className="flex truncate items-center gap-2">
                              {selectedResponse && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: selectedResponse.color }} />}
                              <span className="truncate">{selectedValue}</span>
                            </span>
                          ) : <SelectValue placeholder={`Select ${characteristic.name.toLowerCase()}`} />}
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__empty__">Select…</SelectItem>
                          {options.map((option) => {
                            const response = responses?.get(option);
                            return (
                              <SelectItem key={option} value={option}>
                                <span className="flex items-center gap-2">
                                  {response && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: response.color }} />}
                                  {option}
                                </span>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id={characteristic.id}
                        type={isNumeric ? "number" : "text"}
                        min={isNumeric ? 0 : undefined}
                        max={characteristic.type === "percentage" ? 100 : undefined}
                        value={selectedValue}
                        onChange={(e) => setFormData({
                          ...formData,
                          characteristics: { ...formData.characteristics, [characteristic.name]: e.target.value },
                        })}
                        placeholder={isNumeric ? "Enter number" : `Enter ${characteristic.name.toLowerCase()}`}
                        data-testid={`input-char-${characteristic.id}`}
                      />
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={formData.notes ?? ""}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="Add any additional notes about this student..."
          rows={3}
          data-testid="textarea-notes"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="parentRequests">Parent Requests</Label>
        <Textarea
          id="parentRequests"
          value={formData.parentRequests ?? ""}
          onChange={(e) => setFormData({ ...formData, parentRequests: e.target.value })}
          placeholder="Document any parent placement requests (e.g., 'Please place with Sarah', 'Avoid being in same class as John')..."
          rows={3}
          data-testid="textarea-parent-requests"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="parentNotes">Parent Notes</Label>
        <Textarea
          id="parentNotes"
          value={formData.parentNotes ?? ""}
          onChange={(e) => setFormData({ ...formData, parentNotes: e.target.value })}
          placeholder="Additional notes from parent communications..."
          rows={2}
          data-testid="textarea-parent-notes"
        />
      </div>
    </div>
  );
}
