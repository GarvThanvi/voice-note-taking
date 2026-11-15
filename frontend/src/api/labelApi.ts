import api from "./axiosInstance";

export interface Label {
  id: number;
  name: string;
  color: string;
  noteCount: number;
}

export type NoteLabel = Pick<Label, "id" | "name" | "color">;

interface CreateLabelData {
  name: string;
  color: string;
}

interface UpdateLabelData {
  name?: string;
  color?: string;
}

export const getLabels = async (): Promise<Label[]> => {
  const response = await api.get("/label");
  const data = response.data;
  if (!data.success) {
    throw new Error(data.message);
  }
  return Array.isArray(data.labels) ? data.labels : [];
};

export const createLabel = async (labelData: CreateLabelData): Promise<Label> => {
  const response = await api.post("/label", labelData);
  const data = response.data;
  if (!data.success) {
    throw new Error(data.message);
  }
  return data.label;
};

export const updateLabel = async (
  labelId: number,
  labelData: UpdateLabelData
): Promise<Label> => {
  const response = await api.put(`/label/${labelId}`, labelData);
  const data = response.data;
  if (!data.success) {
    throw new Error(data.message);
  }
  return data.label;
};

export const deleteLabel = async (labelId: number): Promise<void> => {
  const response = await api.delete(`/label/${labelId}`);
  const data = response.data;
  if (!data.success) {
    throw new Error(data.message);
  }
};
