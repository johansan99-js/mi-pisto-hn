package hn.mipisto.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

/**
 * Widget de Mi Pisto HN para la pantalla principal: Gasto, Ingreso, Dictar y Pago fijo.
 *
 * Cada botón abre la app en la misma dirección que los atajos del ícono
 * (?action=new-expense, new-income, dictar, pago-fijo). La app web decide qué hacer:
 * con PIN, el gasto, el ingreso y el dictado se anotan sin desbloquear.
 * El widget no guarda ni lee datos: todo sigue cifrado dentro de la app.
 */
public class MiPistoWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            RemoteViews vista = new RemoteViews(context.getPackageName(), R.layout.widget_mipisto);
            vista.setOnClickPendingIntent(R.id.widget_gasto, abrir(context, "new-expense", 1));
            vista.setOnClickPendingIntent(R.id.widget_ingreso, abrir(context, "new-income", 2));
            vista.setOnClickPendingIntent(R.id.widget_dictar, abrir(context, "dictar", 3));
            vista.setOnClickPendingIntent(R.id.widget_fijo, abrir(context, "pago-fijo", 4));
            vista.setOnClickPendingIntent(R.id.widget_titulo, abrir(context, null, 5));
            manager.updateAppWidget(id, vista);
        }
    }

    /** Abre la app (la actividad de la TWA) en la dirección de la acción */
    static PendingIntent abrir(Context context, String accion, int codigo) {
        String base = context.getString(R.string.widget_url_app);
        Uri uri = Uri.parse(accion == null ? base : base + "?action=" + accion);
        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
        intent.setPackage(context.getPackageName());
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(context, codigo, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
