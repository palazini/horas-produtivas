import { createBrowserRouter } from 'react-router-dom'
import { AppShell } from './shell/AppShell'
import { ImportPage } from '../pages/ImportPage'
import { ResultsPage } from '../pages/ResultsPage'
import { AliasesPage } from '../pages/AliasesPage'
import { TargetsPage } from '../pages/TargetsPage'
import { StructurePage } from '../pages/StructurePage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <ImportPage /> },
      { path: 'results', element: <ResultsPage /> },
      { path: 'aliases', element: <AliasesPage /> },
      { path: 'targets', element: <TargetsPage /> },
      { path: 'structure', element: <StructurePage /> },
    ],
  },
])
