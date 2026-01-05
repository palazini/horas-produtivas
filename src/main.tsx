import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import dayjs from 'dayjs'
import 'dayjs/locale/pt-br'
import { router } from './app/router'
import './index.css'

// Configura dayjs para usar português globalmente
dayjs.locale('pt-br')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)
