package hn.mipisto.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.widget.RemoteViews;

/** Widget chiquito (1×1): un toque y se dicta el gasto. */
public class MiPistoWidgetDictar extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            RemoteViews vista = new RemoteViews(context.getPackageName(), R.layout.widget_mipisto_dictar);
            vista.setOnClickPendingIntent(R.id.widget_dictar_solo, MiPistoWidget.abrir(context, "dictar", 10));
            manager.updateAppWidget(id, vista);
        }
    }
}
