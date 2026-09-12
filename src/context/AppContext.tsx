import React, { createContext, useState, useContext, ReactNode } from 'react';
import { Patient, Report } from '../types';

interface AppContextData {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  patients: Patient[];
  addPatient: (patient: Patient) => void;
  addReport: (patientId: string, report: Report) => void;
}

const AppContext = createContext<AppContextData>({} as AppContextData);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [patients, setPatients] = useState<Patient[]>([]);

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  const addPatient = (patient: Patient) => {
    setPatients((prev) => [...prev, patient]);
  };

  const addReport = (patientId: string, report: Report) => {
    setPatients((prev) =>
      prev.map((p) =>
        p.id === patientId ? { ...p, reports: [...p.reports, report] } : p
      )
    );
  };

  return (
    <AppContext.Provider value={{ theme, toggleTheme, patients, addPatient, addReport }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => useContext(AppContext);
